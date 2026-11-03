import { prisma } from "../../../../../lib/db";
import { env } from "../../../../../lib/env";
import { sweep } from "../../../../../lib/negotiation";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await sweep();
  const n = await prisma.negotiation.findUnique({ where: { id: (await params).id } });
  if (!n) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({
    status: n.status,
    priceCents: n.agreedCents ?? undefined,
    checkoutUrl: n.status === "AGREED" ? `${env().APP_URL}/pay/${n.id}` : undefined,
    pendingApproval: n.status === "AWAITING_APPROVAL",
  });
}
