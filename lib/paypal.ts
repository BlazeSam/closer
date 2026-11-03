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
