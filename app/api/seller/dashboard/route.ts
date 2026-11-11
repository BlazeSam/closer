import { isSeller, unauthorized } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { sweep } from "../../../../lib/negotiation";

export async function GET(req: Request) {
  if (!isSeller(req)) return unauthorized();
  await sweep();
  const [negotiations, approvals] = await Promise.all([
    prisma.negotiation.findMany({ orderBy: { updatedAt: "desc" }, take: 200, include: { listing: { select: { title: true, slug: true, currency: true, askCents: true } } } }),
    prisma.approvalRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { negotiation: { select: { buyerLabel: true, listing: { select: { title: true, currency: true } } } } } }),
  ]);
  return Response.json({
    rows: negotiations.map((n) => ({
      id: n.id, listing: n.listing.title, slug: n.listing.slug, currency: n.listing.currency, asking: n.listing.askCents, buyer: `${n.buyerType === "AGENT" ? "Agent" : "Human"}: ${n.buyerLabel}`,
      channel: n.buyerType === "AGENT" ? "Buyer agent" : n.channel === "WEB" ? "Web chat" : n.channel === "MOCK" ? "Pasted" : "Marketplace extension", round: n.round,
      status: n.status, lastOffer: n.lastBuyerOfferCents, counter: n.lastCounterCents, agreed: n.agreedCents,
      paypal: n.paypalCaptureId ? "CAPTURED" : n.paypalOrderId ? "ORDER_CREATED" : "-", updatedAt: n.updatedAt,
    })),
    approvals: approvals.map((a) => ({ id: a.id, kind: a.kind, details: a.details, createdAt: a.createdAt, buyer: a.negotiation.buyerLabel, listing: a.negotiation.listing.title, currency: a.negotiation.listing.currency })),
  });
}
