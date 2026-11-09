import { prisma } from "../../../../lib/db";
import { allow, clientIp } from "../../../../lib/ratelimit";

// DEMO ONLY. The landing page runs a real negotiation, which really does reserve and sell the item,
// so without this the first visitor to close a deal leaves every later visitor a sold-out page.
//
// Deliberately narrow: it touches ONLY the three seeded demo slugs and only ever puts them back on
// sale. It cannot reach a listing a real seller created, cannot change a price, and cannot delete
// anything. Open on purpose, since a judge has no login - hence the allowlist rather than auth.
const DEMO_SLUGS = ["road-bike", "standing-desk", "film-camera"];

export async function POST(req: Request) {
  if (!allow(`demo-reset:${clientIp(req)}`, 10, 60_000)) return Response.json({ error: "rate limited" }, { status: 429 });

  const listings = await prisma.listing.findMany({ where: { slug: { in: DEMO_SLUGS } }, select: { id: true } });
  const ids = listings.map((l) => l.id);
  const [relisted, closed] = await prisma.$transaction([
    prisma.listing.updateMany({ where: { id: { in: ids } }, data: { status: "ACTIVE", reservedUntil: null, reservedByNegotiationId: null } }),
    // Retire their in-flight negotiations so a stale AGREED one cannot be paid after the reset.
    prisma.negotiation.updateMany({ where: { listingId: { in: ids }, status: { in: ["OPEN", "AWAITING_APPROVAL", "AGREED"] } }, data: { status: "EXPIRED" } }),
  ]);
  return Response.json({ ok: true, relisted: relisted.count, closed: closed.count });
}
