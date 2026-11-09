import { prisma } from "../../../../lib/db";
import { env } from "../../../../lib/env";
import { markPaid } from "../../../../lib/negotiation";
import { getInvoice, verifyInvoicePaid, webhookIsGenuine } from "../../../../lib/paypal";

// PayPal calls this. Everything in the body is attacker-controlled until PayPal itself confirms the
// signature, so nothing here is trusted before that check, and even afterwards the PAID amount is
// re-read from the PayPal API rather than taken from the event payload.
//
// Always 200 on a genuine event we cannot act on: a non-2xx makes PayPal retry for days.
export async function POST(req: Request) {
  const raw = await req.text();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID ?? "";
  if (!webhookId) return Response.json({ error: "webhook not configured" }, { status: 503 });
  if (!(await webhookIsGenuine(req.headers, raw, webhookId))) {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }

  let event: { event_type?: string; resource?: { id?: string; invoice?: { id?: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true, ignored: "unparseable" });
  }

  if (event.event_type !== "INVOICING.INVOICE.PAID") {
    // PAYMENT.CAPTURE.COMPLETED is handled by the capture route itself; nothing to do here.
    return Response.json({ ok: true, ignored: event.event_type ?? "unknown" });
  }

  const invoiceId = event.resource?.invoice?.id ?? event.resource?.id;
  if (!invoiceId) return Response.json({ ok: true, ignored: "no invoice id" });

  // Re-fetch from PayPal: the event told us WHICH invoice, not what it is worth.
  const inv = await getInvoice(invoiceId);
  const negotiationId = inv.detail?.reference;
  if (!negotiationId) return Response.json({ ok: true, ignored: "invoice has no negotiation reference" });

  const n = await prisma.negotiation.findUnique({ where: { id: negotiationId }, include: { listing: { select: { currency: true } } } });
  if (!n || n.agreedCents == null) return Response.json({ ok: true, ignored: "unknown negotiation" });

  const v = verifyInvoicePaid(inv, n.agreedCents, n.listing.currency, negotiationId);
  if (!v.ok) {
    await prisma.auditEvent.create({ data: { negotiationId, type: "PAYPAL_INVOICE_MISMATCH", payload: { reason: v.reason, invoiceId } } });
    return Response.json({ ok: true, ignored: v.reason });
  }

  const result = await markPaid({ negotiationId, invoiceId, via: "INVOICE" });
  return Response.json({ ok: true, result });
}
