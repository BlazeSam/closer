import { isSeller, unauthorized } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { channelLabel, computeAnalytics } from "../../../../lib/analytics";

export async function GET(req: Request) {
  if (!isSeller(req)) return unauthorized();
  const [listings, negs] = await Promise.all([
    prisma.listing.findMany({ select: { id: true, title: true, askCents: true, currency: true }, orderBy: { createdAt: "desc" } }),
    prisma.negotiation.findMany({
      select: {
        listingId: true, buyerType: true, channel: true, status: true, round: true, agreedCents: true, lastBuyerOfferCents: true, paypalCaptureId: true, updatedAt: true,
        messages: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
        audit: { where: { type: { in: ["POLICY_DECISION", "APPROVAL_RESOLVED"] } }, select: { type: true, payload: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    }),
  ]);
  const out = computeAnalytics(
    listings,
    negs.map((n) => {
      const agreed = n.audit.find((a) => {
        const p = a.payload as { decision?: { type?: string }; approve?: boolean } | null;
        return a.type === "POLICY_DECISION" ? p?.decision?.type === "ACCEPT" : p?.approve === true;
      });
      const isDeal = n.status === "AGREED" || n.status === "PAID" || !!n.paypalCaptureId;
      return {
        listingId: n.listingId, channel: channelLabel(n.buyerType, n.channel), status: n.status, paid: n.status === "PAID" || !!n.paypalCaptureId, round: n.round,
        agreedCents: n.agreedCents, bestOfferCents: n.lastBuyerOfferCents, firstMessageAt: n.messages[0]?.createdAt.getTime() ?? null,
        // No agreedAt column: use the audit event where the deal was struck (ACCEPT decision or approved request); if none exists, fall back to updatedAt (approximate).
        agreedAt: isDeal ? (agreed?.createdAt ?? n.updatedAt).getTime() : null,
      };
    }),
  );
  return Response.json(out);
}
