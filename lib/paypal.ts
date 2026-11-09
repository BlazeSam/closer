import { env } from "./env";

const base = () => (env().PAYPAL_ENVIRONMENT === "LIVE" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

let token: { value: string; exp: number } | undefined;

export async function accessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = env();
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function call<T>(path: string, body: unknown, requestId: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", "PayPal-Request-Id": requestId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PayPal ${path} failed: ${res.status} ${text}`);
  return JSON.parse(text) as T;
}

export const centsToValue = (c: number) => (c / 100).toFixed(2);

export type PayPalOrder = { id: string; status: string; links?: { rel: string; href: string }[] };

// Amount always comes from our DB (agreedCents), never from the client or the LLM.
export function createOrder(p: { agreedCents: number; currency: string; negotiationId: string; description: string }) {
  return call<PayPalOrder>(
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: p.negotiationId,
          description: p.description.slice(0, 127),
          amount: { currency_code: p.currency, value: centsToValue(p.agreedCents) },
        },
      ],
    },
    `order-${p.negotiationId}`,
  );
}

export type Capture = {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: { id: string; status: string; amount: { currency_code: string; value: string } }[] } }[];
};

export const captureOrder = (orderId: string) => call<Capture>(`/v2/checkout/orders/${orderId}/capture`, undefined, `capture-${orderId}`);

// Pure check, unit tested: order must be COMPLETED and the captured amount/currency must equal the agreed price.
export function verifyCapture(c: Capture, agreedCents: number, currency: string): { ok: true; captureId: string } | { ok: false; reason: string } {
  if (c.status !== "COMPLETED") return { ok: false, reason: `order status ${c.status}` };
  const cap = c.purchase_units?.[0]?.payments?.captures?.[0];
  if (!cap || cap.status !== "COMPLETED") return { ok: false, reason: "no completed capture" };
  if (cap.amount.currency_code !== currency) return { ok: false, reason: "currency mismatch" };
  if (cap.amount.value !== centsToValue(agreedCents)) return { ok: false, reason: "amount mismatch" };
  return { ok: true, captureId: cap.id };
}

// ---------------------------------------------------------------------------
// Invoicing. The seller sends a PayPal invoice and the buyer pays on paypal.com.
// This exists because asking a Marketplace buyer to follow a link to a site they
// have never heard of, to type card details, is exactly what a scam looks like.
// The amount always comes from Negotiation.agreedCents, never from the chat.
// ---------------------------------------------------------------------------

export type PayPalInvoice = {
  id: string;
  status: string;
  detail?: { reference?: string; currency_code?: string };
  amount?: { currency_code: string; value: string };
  links?: { rel: string; href: string }[];
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`PayPal ${path} failed: ${res.status} ${text}`);
  return JSON.parse(text) as T;
}

// The negotiation id travels in detail.reference so a webhook can be mapped back to it without
// trusting anything the payer typed.
export function invoiceDraft(p: { agreedCents: number; currency: string; negotiationId: string; title: string; buyerEmail: string; invoiceNumber: string; sellerEmail?: string }) {
  return {
    detail: {
      invoice_number: p.invoiceNumber,
      reference: p.negotiationId,
      currency_code: p.currency,
      note: "Agreed with the seller's Closer agent.",
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    },
    invoicer: p.sellerEmail ? { email_address: p.sellerEmail } : undefined,
    primary_recipients: [{ billing_info: { email_address: p.buyerEmail } }],
    items: [
      {
        name: p.title.slice(0, 200),
        quantity: "1",
        unit_amount: { currency_code: p.currency, value: centsToValue(p.agreedCents) },
      },
    ],
  };
}

export const nextInvoiceNumber = () => call<{ invoice_number: string }>("/v2/invoicing/generate-next-invoice-number", undefined, `inv-num-${Date.now()}`);
// Creating an invoice returns only a self link, NOT the invoice object, so the id has to be taken
// out of the href. Pure and tested, because getting it wrong sends PayPal "/invoices/undefined/send".
export function invoiceIdFromHref(href?: string): string | undefined {
  return /\/invoicing\/invoices\/([A-Za-z0-9-]+)\/?$/.exec(href ?? "")?.[1];
}

export async function createInvoice(draft: unknown, requestId: string): Promise<{ id: string }> {
  const r = await call<{ id?: string; href?: string }>("/v2/invoicing/invoices", draft, requestId);
  const id = r.id ?? invoiceIdFromHref(r.href);
  if (!id) throw new Error(`PayPal create invoice returned no id: ${JSON.stringify(r).slice(0, 200)}`);
  return { id };
}
export const sendInvoice = (invoiceId: string) => call<{ href?: string }>(`/v2/invoicing/invoices/${invoiceId}/send`, { send_to_recipient: true }, `send-${invoiceId}`);
export const getInvoice = (invoiceId: string) => get<PayPalInvoice>(`/v2/invoicing/invoices/${invoiceId}`);

// Pure, unit tested. Mirrors verifyCapture: the invoice must be PAID, for the agreed amount, in the
// agreed currency, and must belong to THIS negotiation.
export function verifyInvoicePaid(inv: PayPalInvoice, agreedCents: number, currency: string, negotiationId: string): { ok: true } | { ok: false; reason: string } {
  if (inv.status !== "PAID" && inv.status !== "MARKED_AS_PAID") return { ok: false, reason: `invoice status ${inv.status}` };
  if (inv.detail?.reference !== negotiationId) return { ok: false, reason: "invoice belongs to another negotiation" };
  const amt = inv.amount;
  if (!amt) return { ok: false, reason: "invoice has no amount" };
  if (amt.currency_code !== currency) return { ok: false, reason: "currency mismatch" };
  if (amt.value !== centsToValue(agreedCents)) return { ok: false, reason: "amount mismatch" };
  return { ok: true };
}

// PayPal verifies its own signature for us, so a forged webhook cannot be replayed at us.
export async function webhookIsGenuine(headers: Headers, rawBody: string, webhookId: string): Promise<boolean> {
  const need = (h: string) => headers.get(h) ?? "";
  const body = {
    auth_algo: need("paypal-auth-algo"),
    cert_url: need("paypal-cert-url"),
    transmission_id: need("paypal-transmission-id"),
    transmission_sig: need("paypal-transmission-sig"),
    transmission_time: need("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  };
  if (!body.transmission_id || !body.transmission_sig) return false;
  try {
    const r = await call<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", body, `verify-${body.transmission_id}`);
    return r.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}
