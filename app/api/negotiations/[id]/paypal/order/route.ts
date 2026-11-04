import { prisma } from "../../../../../../lib/db";
import { reviveForCheckout, sweep } from "../../../../../../lib/negotiation";
import { createOrder } from "../../../../../../lib/paypal";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await sweep();
  const { id } = await params;
  await reviveForCheckout(id); // opening checkout keeps the deal alive
  const n = await prisma.negotiation.findUnique({ where: { id }, include: { listing: { select: { title: true, currency: true } } } });
  if (!n) return Response.json({ error: "not found" }, { status: 404 });
  if (n.status !== "AGREED" || n.agreedCents == null) return Response.json({ error: `not payable (${n.status})` }, { status: 409 });
  if (n.paypalOrderId) return Response.json({ id: n.paypalOrderId });

  // Amount comes from the DB only. PayPal-Request-Id (= negotiation id) makes a concurrent double call return the same order.
  const order = await createOrder({ agreedCents: n.agreedCents, currency: n.listing.currency, negotiationId: n.id, description: n.listing.title });
  await prisma.$transaction([
    prisma.negotiation.updateMany({ where: { id, paypalOrderId: null }, data: { paypalOrderId: order.id } }),
    prisma.auditEvent.create({ data: { negotiationId: id, type: "PAYPAL_ORDER_CREATED", payload: { orderId: order.id, agreedCents: n.agreedCents } } }),
  ]);
  const fresh = await prisma.negotiation.findUniqueOrThrow({ where: { id }, select: { paypalOrderId: true } });
  return Response.json({ id: fresh.paypalOrderId });
}
