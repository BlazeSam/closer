import { prisma } from "../../../../lib/db";
import { sweep } from "../../../../lib/negotiation";
import { publicSelect } from "../../../../lib/publicListing";

// Buyer poll: transcript + status. Negotiation ids are unguessable cuids.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await sweep();
  const n = await prisma.negotiation.findUnique({
    where: { id: (await params).id },
    select: {
      id: true, status: true, agreedCents: true, paidAt: true,
      listing: { select: publicSelect },
      messages: { orderBy: { createdAt: "asc" }, select: { role: true, content: true, createdAt: true } },
    },
  });
  if (!n) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(n);
}
