import { prisma } from "../../../../../../lib/db";
import { markPaid, reviveForCheckout } from "../../../../../../lib/negotiation";
import { captureOrder, verifyCapture } from "../../../../../../lib/paypal";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Buyer already approved at PayPal; don't let the expiry timer strand them if the listing is still free.
  await reviveForCheckout(id);
  const n = await prisma.negotiation.findUnique({ where: { id }, include: { listing: { select: { id: true, currency: true } } } });
  if (!n) return Response.json({ error: "not found" }, { status: 404 });
  if (n.status === "PAID") return Response.json({ ok: true, captureId: n.paypalCaptureId });
  if (n.status !== "AGREED" || n.agreedCents == null || !n.paypalOrderId) return Response.json({ error: "not payable" }, { status: 409 });

  // Always capture the order WE stored, never an id supplied by the client.
  let cap;
  try {
    cap = await captureOrder(n.paypalOrderId);
  } catch (e) {
    await prisma.auditEvent.create({ data: { negotiationId: id, type: "PAYPAL_CAPTURE_ERROR", payload: { error: String(e) } } });
    return Response.json({ error: "payment could not be captured, you can retry" }, { status: 502 });
  }
  const v = verifyCapture(cap, n.agreedCents, n.listing.currency);
  if (!v.ok) {
    await prisma.auditEvent.create({ data: { negotiationId: id, type: "PAYPAL_CAPTURE_MISMATCH", payload: { reason: v.reason, orderId: n.paypalOrderId } } });
    return Response.json({ error: `payment verification failed: ${v.reason}` }, { status: 502 });
  }
  // Shared with the invoice webhook so "paid" means one thing in both paths.
  await markPaid({ negotiationId: id, captureId: v.captureId, via: "CAPTURE" });
  return Response.json({ ok: true, captureId: v.captureId });
}
