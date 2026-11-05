import { prisma } from "../../../../../lib/db";
import { INVARIANTS, redactForBuyer } from "../../../../../lib/trace";

// Buyer-facing trace of what the system did. Redaction lives in lib/trace.ts; this route must never
// widen it, because the raw audit log contains the floor-revealing decision branch.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await prisma.negotiation.findUnique({ where: { id }, select: { listing: { select: { currency: true } } } });
  if (!n) return Response.json({ error: "not found" }, { status: 404 });
  const events = await prisma.auditEvent.findMany({ where: { negotiationId: id }, orderBy: { createdAt: "asc" }, take: 100, select: { type: true, payload: true, createdAt: true } });
  return Response.json({ entries: redactForBuyer(events, n.listing.currency), invariants: INVARIANTS });
}
