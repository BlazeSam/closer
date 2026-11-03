import { isSeller, unauthorized } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSeller(req)) return unauthorized();
  const n = await prisma.negotiation.findUnique({
    where: { id: (await params).id },
    include: { messages: { orderBy: { createdAt: "asc" } }, audit: { orderBy: { createdAt: "asc" } } },
  });
  return n ? Response.json(n) : Response.json({ error: "not found" }, { status: 404 });
}
