// DB-backed negotiation state machine. Every state change is a transaction guarded by
// Negotiation.version (optimistic concurrency), so races never double-agree or double-count rounds.
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { counterFor, evaluateOffer } from "./policy";
import { fmt } from "./replies";

export type Outcome =
  | { kind: "ACCEPT"; priceCents: number }
  | { kind: "COUNTER"; priceCents: number }
  | { kind: "FINAL"; priceCents: number }
  | { kind: "PENDING" }
  | { kind: "INVALID" }
  | { kind: "UNAVAILABLE" }
  | { kind: "CLOSED" };

export class ConflictError extends Error {}

type Tx = Prisma.TransactionClient;
const minutes = (m: number) => new Date(Date.now() + m * 60_000);
const audit = (tx: Tx, negotiationId: string, type: string, payload: Prisma.InputJsonValue) =>
  tx.auditEvent.create({ data: { negotiationId, type, payload } });

// Take (or keep) the reservation. False when someone else holds it or it's sold.
async function reserve(tx: Tx, listingId: string, negotiationId: string): Promise<boolean> {
  const now = new Date();
  const { count } = await tx.listing.updateMany({
    where: {
      id: listingId,
      OR: [
        { status: "ACTIVE" },
        { status: "RESERVED", reservedByNegotiationId: negotiationId },
        { status: "RESERVED", reservedUntil: { lt: now } },
      ],
    },
    data: { status: "RESERVED", reservedByNegotiationId: negotiationId, reservedUntil: minutes(env().RESERVATION_MINUTES) },
  });
  return count === 1;
}

const agree = (tx: Tx, n: { id: string; listingId: string }, priceCents: number) =>
  reserve(tx, n.listingId, n.id).then((ok) => {
    if (!ok) return null;
    return { status: "AGREED" as const, agreedCents: priceCents, agreedExpiresAt: minutes(env().RESERVATION_MINUTES) };
  });

export async function applyOffer(negotiationId: string, offerCents: number, offerCurrency?: string): Promise<Outcome> {
  await sweep();
  return prisma.$transaction(async (tx) => {
    const n = await tx.negotiation.findUniqueOrThrow({ where: { id: negotiationId }, include: { listing: { include: { private: true } } } });
    const l = n.listing;
    if (n.status !== "OPEN") return { kind: "CLOSED" };
    if (!l.private) throw new Error("listing missing private prices");
    if (l.status === "SOLD" || l.status === "PAUSED") return { kind: "UNAVAILABLE" };
    if (l.status === "RESERVED" && l.reservedByNegotiationId !== n.id && l.reservedUntil && l.reservedUntil > new Date()) {
      return { kind: "UNAVAILABLE" };
    }

    const d = evaluateOffer(
      { askCents: l.askCents, floorCents: l.private.floorCents, autoAcceptCents: l.private.autoAcceptCents, currency: l.currency },
      { round: n.round, lastCounterCents: n.lastCounterCents, seed: n.id, prevBuyerOfferCents: n.lastBuyerOfferCents },
      offerCents,
      { maxRounds: env().MAX_ROUNDS, offerCurrency },
    );
    await audit(tx, n.id, "POLICY_DECISION", { offerCents, decision: d, round: n.round });
    if (d.type === "REJECT_INVALID") return { kind: "INVALID" };

    let data: Prisma.NegotiationUpdateManyMutationInput = { lastBuyerOfferCents: offerCents };
    let out: Outcome;
    if (d.type === "ACCEPT") {
      const a = await agree(tx, n, d.priceCents);
      if (!a) return { kind: "UNAVAILABLE" };
      data = { ...data, ...a };
      out = { kind: "ACCEPT", priceCents: d.priceCents };
    } else if (d.type === "NEEDS_APPROVAL") {
      // Shadow approval: negotiation stays OPEN and the buyer sees a normal counter (no tell).
      data = { ...data, lastCounterCents: d.counterCents };
      await tx.approvalRequest.create({ data: { negotiationId: n.id, kind: "PRICE", details: { offerCents, shadow: true } } });
      out = { kind: d.final ? "FINAL" : "COUNTER", priceCents: d.counterCents };
    } else {
      data = { ...data, lastCounterCents: d.priceCents };
      out = { kind: d.type === "FINAL_OFFER" ? "FINAL" : "COUNTER", priceCents: d.priceCents };
    }
    const { count } = await tx.negotiation.updateMany({
      where: { id: n.id, version: n.version },
      data: { ...data, round: { increment: 1 }, version: { increment: 1 } },
    });
    if (count !== 1) throw new ConflictError("negotiation changed, retry");
    return out;
  });
}

// A buyer who is mid-checkout (or already approved at PayPal) shouldn't lose the deal to the expiry timer.
// Revive an EXPIRED deal if the listing is still free; refresh the clock on an AGREED one.
export async function reviveForCheckout(negotiationId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const n = await tx.negotiation.findUniqueOrThrow({ where: { id: negotiationId } });
    if (n.agreedCents == null || (n.status !== "EXPIRED" && n.status !== "AGREED")) return false;
    if (!(await reserve(tx, n.listingId, n.id))) return false;
    await tx.negotiation.update({ where: { id: n.id }, data: { status: "AGREED", agreedExpiresAt: minutes(env().RESERVATION_MINUTES), version: { increment: 1 } } });
    if (n.status === "EXPIRED") await audit(tx, n.id, "DEAL_REVIVED", { reason: "checkout after expiry" });
    return true;
  });
}

export async function addMessage(negotiationId: string, role: "BUYER" | "SELLER_AGENT" | "SELLER" | "SYSTEM", content: string) {
  return prisma.message.create({ data: { negotiationId, role, content } });
}

export async function createCustomApproval(negotiationId: string, question: string) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.approvalRequest.create({ data: { negotiationId, kind: "CUSTOM", details: { question } } });
    await tx.negotiation.updateMany({ where: { id: negotiationId, status: "OPEN" }, data: { status: "AWAITING_APPROVAL", version: { increment: 1 } } });
    await audit(tx, negotiationId, "ASK_SELLER", { question });
    return a;
  });
}

// Seller (or TTL expiry) resolves an approval. PRICE: approve => AGREED at the buyer's offer; deny => next counter.
export async function resolveApproval(approvalId: string, approve: boolean, reply?: string, by: "SELLER" | "TTL" = "SELLER") {
  return prisma.$transaction(async (tx) => {
    const a = await tx.approvalRequest.findUniqueOrThrow({ where: { id: approvalId }, include: { negotiation: { include: { listing: { include: { private: true } } } } } });
    if (a.status !== "PENDING") return a.status;
    const n = a.negotiation;
    const l = n.listing;
    const { count } = await tx.approvalRequest.updateMany({
      where: { id: a.id, status: "PENDING" },
      data: { status: by === "TTL" ? "EXPIRED" : approve ? "APPROVED" : "DENIED", sellerReply: reply ?? null, resolvedAt: new Date() },
    });
    if (count !== 1) return "RACE";
    await audit(tx, n.id, "APPROVAL_RESOLVED", { approvalId, approve, by, reply: reply ?? null });

    if (a.kind === "CUSTOM") {
      await tx.negotiation.updateMany({ where: { id: n.id, status: "AWAITING_APPROVAL" }, data: { status: "OPEN", version: { increment: 1 } } });
      if (reply) await tx.message.create({ data: { negotiationId: n.id, role: "SELLER", content: reply } });
      return "OK";
    }

    const { offerCents: offer, shadow } = a.details as { offerCents: number; shadow?: boolean };
    if (shadow) {
      // Buyer was already shown a counter. Deny/expire = silence. Approve = accept their offer if still open.
      if (!approve || by !== "SELLER" || n.status !== "OPEN") return "OK";
      const ag = await agree(tx, n, offer);
      if (!ag) return "UNAVAILABLE";
      await tx.negotiation.update({ where: { id: n.id }, data: { ...ag, version: { increment: 1 } } });
      await tx.message.create({ data: { negotiationId: n.id, role: "SELLER_AGENT", content: `Good news, the seller accepted ${fmt(offer, l.currency)}. You can pay securely with PayPal below.` } });
      return "OK";
    }
    if (approve && by === "SELLER") {
      const ag = await agree(tx, n, offer);
      if (!ag) {
        await tx.negotiation.update({ where: { id: n.id }, data: { status: "DECLINED", version: { increment: 1 } } });
        await tx.message.create({ data: { negotiationId: n.id, role: "SYSTEM", content: "Sorry, this item is no longer available." } });
        return "UNAVAILABLE";
      }
      await tx.negotiation.update({ where: { id: n.id }, data: { ...ag, version: { increment: 1 } } });
      await tx.message.create({ data: { negotiationId: n.id, role: "SELLER_AGENT", content: `Good news, the seller accepted ${fmt(offer, l.currency)}. You can pay securely with PayPal below.` } });
      return "OK";
    }
    // Denied / expired: counter with the next schedule step (policy supplies the price, never the seller's text).
    if (!l.private) throw new Error("listing missing private prices");
    const price = counterFor(
      { askCents: l.askCents, floorCents: l.private.floorCents, autoAcceptCents: l.private.autoAcceptCents, currency: l.currency },
      { round: n.round, lastCounterCents: n.lastCounterCents, seed: n.id, prevBuyerOfferCents: n.lastBuyerOfferCents },
    );
    await tx.negotiation.update({ where: { id: n.id }, data: { status: "OPEN", lastCounterCents: price, version: { increment: 1 } } });
    await tx.message.create({ data: { negotiationId: n.id, role: "SELLER_AGENT", content: `I checked, and the best I can do is ${fmt(price, l.currency)}.` } });
    return "OK";
  });
}

// Cheap housekeeping run at the start of requests: expire stale approvals and unpaid deals, free reservations.
export async function sweep() {
  const now = new Date();
  const staleApprovals = await prisma.approvalRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - env().APPROVAL_TTL_MINUTES * 60_000) } },
    select: { id: true },
  });
  for (const a of staleApprovals) await resolveApproval(a.id, false, undefined, "TTL");

  const stale = await prisma.negotiation.findMany({ where: { status: "AGREED", agreedExpiresAt: { lt: now } }, select: { id: true } });
  for (const { id } of stale) {
    await prisma.negotiation.updateMany({ where: { id, status: "AGREED" }, data: { status: "EXPIRED", version: { increment: 1 } } });
    await prisma.listing.updateMany({ where: { reservedByNegotiationId: id, status: "RESERVED" }, data: { status: "ACTIVE", reservedByNegotiationId: null, reservedUntil: null } });
    await prisma.message.create({ data: { negotiationId: id, role: "SYSTEM", content: "This deal expired because payment wasn't completed in time." } });
  }
}

// Both payment paths end here: the hosted card page (capture) and a PayPal invoice (webhook). One
// function so they can never drift apart on what "paid" means. Idempotent: the updateMany is
// conditioned on AGREED, so a replayed webhook or a double capture changes nothing.
export async function markPaid(p: { negotiationId: string; captureId?: string; invoiceId?: string; via: "CAPTURE" | "INVOICE" }): Promise<"PAID" | "ALREADY" | "NOT_PAYABLE"> {
  const n = await prisma.negotiation.findUnique({ where: { id: p.negotiationId }, include: { listing: { select: { id: true, currency: true } } } });
  if (!n) return "NOT_PAYABLE";
  if (n.status === "PAID") return "ALREADY";
  if (n.status !== "AGREED" || n.agreedCents == null) return "NOT_PAYABLE";
  const updated = await prisma.negotiation.updateMany({
    where: { id: p.negotiationId, status: "AGREED" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      version: { increment: 1 },
      ...(p.captureId ? { paypalCaptureId: p.captureId } : {}),
      ...(p.invoiceId ? { paypalInvoiceId: p.invoiceId } : {}),
    },
  });
  if (updated.count === 0) return "ALREADY"; // another request won the race
  await prisma.$transaction([
    prisma.listing.update({ where: { id: n.listing.id }, data: { status: "SOLD", reservedUntil: null } }),
    prisma.message.create({ data: { negotiationId: p.negotiationId, role: "SYSTEM", content: `Payment received: ${fmt(n.agreedCents, n.listing.currency)}. Thanks! The seller will be in touch.` } }),
    prisma.auditEvent.create({ data: { negotiationId: p.negotiationId, type: p.via === "INVOICE" ? "PAYPAL_INVOICE_PAID" : "PAYPAL_CAPTURED", payload: { captureId: p.captureId, invoiceId: p.invoiceId, agreedCents: n.agreedCents } } }),
  ]);
  return "PAID";
}
