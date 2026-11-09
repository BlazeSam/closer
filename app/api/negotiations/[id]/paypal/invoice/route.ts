import { prisma } from "../../../../../../lib/db";
import { isSeller, unauthorized } from "../../../../../../lib/auth";
import { createInvoice, invoiceDraft, nextInvoiceNumber, sendInvoice } from "../../../../../../lib/paypal";
import { allow } from "../../../../../../lib/ratelimit";

// SELLER ONLY. Sends a PayPal invoice for an agreed negotiation so the buyer pays on paypal.com.
// The buyer never supplies the email here and never supplies the amount: the email is typed by the
// seller, the amount is read from Negotiation.agreedCents.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSeller(req)) return unauthorized();
  const { id } = await params;
  if (!allow(`invoice:${id}`, 5, 60_000)) return Response.json({ error: "Too many invoice attempts, wait a moment." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!EMAIL.test(email) || email.length > 254) return Response.json({ error: "Enter a valid buyer email." }, { status: 400 });

  const n = await prisma.negotiation.findUnique({ where: { id }, include: { listing: { select: { title: true, currency: true } } } });
  if (!n) return Response.json({ error: "not found" }, { status: 404 });
  if (n.status === "PAID") return Response.json({ error: "already paid" }, { status: 409 });
  if (n.status !== "AGREED" || n.agreedCents == null) return Response.json({ error: `not invoiceable (${n.status})` }, { status: 409 });
  if (n.paypalInvoiceId) return Response.json({ id: n.paypalInvoiceId, alreadySent: true });

  try {
    const { invoice_number } = await nextInvoiceNumber();
    const draft = invoiceDraft({
      agreedCents: n.agreedCents,
      currency: n.listing.currency,
      negotiationId: n.id,
      title: n.listing.title,
      buyerEmail: email,
      invoiceNumber: invoice_number,
    });
    // PayPal-Request-Id is the negotiation id, so a double click cannot create two invoices.
    const inv = await createInvoice(draft, `invoice-${n.id}`);
    await sendInvoice(inv.id);
    await prisma.$transaction([
      prisma.negotiation.updateMany({ where: { id, paypalInvoiceId: null }, data: { paypalInvoiceId: inv.id, buyerEmail: email } }),
      prisma.auditEvent.create({ data: { negotiationId: id, type: "PAYPAL_INVOICE_SENT", payload: { invoiceId: inv.id, agreedCents: n.agreedCents } } }),
    ]);
    return Response.json({ id: inv.id, sentTo: email });
  } catch (e) {
    await prisma.auditEvent.create({ data: { negotiationId: id, type: "PAYPAL_INVOICE_ERROR", payload: { error: String(e).slice(0, 500) } } });
    // Same rule as the rest of the app: a provider failure degrades, it does not 500.
    return Response.json({ error: "PayPal would not send that invoice. The card checkout link still works." }, { status: 502 });
  }
}
