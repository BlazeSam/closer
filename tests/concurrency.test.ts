// Needs the real DB. Parallel offers must never double-count a round or double-agree a listing.
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";

const live = Boolean(process.env.DATABASE_URL);
process.env.CLOSER_NO_DELAY = "1";

describe.skipIf(!live)("negotiation concurrency (live DB)", () => {
  const made: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    await prisma.listing.updateMany({ where: { slug: "film-camera" }, data: { status: "ACTIVE", reservedByNegotiationId: null, reservedUntil: null } });
    for (const id of made) {
      await prisma.auditEvent.deleteMany({ where: { negotiationId: id } });
      await prisma.approvalRequest.deleteMany({ where: { negotiationId: id } });
      await prisma.message.deleteMany({ where: { negotiationId: id } });
      await prisma.negotiation.deleteMany({ where: { id } });
    }
  });

  it("parallel lowballs on one negotiation: round == successful offers", async () => {
    const { startNegotiation } = await import("../lib/sellerAgent");
    const { applyOffer } = await import("../lib/negotiation");
    const { prisma } = await import("../lib/db");
    const n = (await startNegotiation("film-camera", "AGENT", "conc", `c-${Math.random()}`))!;
    made.push(n.id);
    const res = await Promise.allSettled(Array.from({ length: 6 }, () => applyOffer(n.id, 100)));
    const ok = res.filter((r) => r.status === "fulfilled").length;
    const after = await prisma.negotiation.findUniqueOrThrow({ where: { id: n.id } });
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(after.round).toBe(ok);
  }, 60_000);

  it("two negotiations both offering auto-accept: only one gets AGREED", async () => {
    const { startNegotiation } = await import("../lib/sellerAgent");
    const { applyOffer } = await import("../lib/negotiation");
    const { prisma } = await import("../lib/db");
    const l = await prisma.listing.findUniqueOrThrow({ where: { slug: "film-camera" } });
    const ns = await Promise.all([1, 2, 3].map((i) => startNegotiation("film-camera", "AGENT", `race${i}`, `r-${Math.random()}`)));
    ns.forEach((n) => made.push(n!.id));
    await Promise.allSettled(ns.map((n) => applyOffer(n!.id, l.askCents)));
    const agreed = await prisma.negotiation.count({ where: { id: { in: ns.map((n) => n!.id) }, status: "AGREED" } });
    expect(agreed).toBe(1);
  }, 60_000);

  it("mid-band offer looks like a counter, then seller approval agrees at the offer", async () => {
    const { startNegotiation } = await import("../lib/sellerAgent");
    const { applyOffer, resolveApproval } = await import("../lib/negotiation");
    const { prisma } = await import("../lib/db");
    const l = await prisma.listing.findUniqueOrThrow({ where: { slug: "film-camera" }, include: { private: true } });
    await prisma.listing.update({ where: { id: l.id }, data: { status: "ACTIVE", reservedByNegotiationId: null, reservedUntil: null } }); // earlier test left it reserved
    const offer = l.private!.floorCents;
    if (offer >= l.private!.autoAcceptCents) return; // no mid-band on this listing
    const n = (await startNegotiation("film-camera", "AGENT", "shadow", `s-${Math.random()}`))!;
    made.push(n.id);
    const out = await applyOffer(n.id, offer);
    expect(["COUNTER", "FINAL"]).toContain(out.kind);
    const mid = await prisma.negotiation.findUniqueOrThrow({ where: { id: n.id } });
    expect(mid.status).toBe("OPEN");
    const a = await prisma.approvalRequest.findFirstOrThrow({ where: { negotiationId: n.id, status: "PENDING" } });
    await resolveApproval(a.id, true);
    const done = await prisma.negotiation.findUniqueOrThrow({ where: { id: n.id } });
    expect(done.status).toBe("AGREED");
    expect(done.agreedCents).toBe(offer);
  }, 60_000);

  it("one external thread maps to one negotiation, even under concurrent first messages", async () => {
    const { startNegotiation } = await import("../lib/sellerAgent");
    const { applyOffer } = await import("../lib/negotiation");
    const { prisma } = await import("../lib/db");
    await prisma.listing.updateMany({ where: { slug: "film-camera" }, data: { status: "ACTIVE", reservedByNegotiationId: null, reservedUntil: null } }); // earlier tests leave it reserved
    const thread = { channel: "FB_MARKETPLACE" as const, externalThreadId: `fb-${Math.random()}` };
    const got = await Promise.all([1, 2, 3].map(() => startNegotiation("film-camera", "HUMAN", "fb buyer", "ext", thread)));
    expect(new Set(got.map((n) => n!.id)).size).toBe(1);
    made.push(got[0]!.id);
    expect(got[0]!.channel).toBe("FB_MARKETPLACE");
    // The round counter has to survive across messages, or every reply would restart the counter schedule.
    await applyOffer(got[0]!.id, 100);
    const again = (await startNegotiation("film-camera", "HUMAN", "fb buyer", "ext", thread))!;
    expect(again.id).toBe(got[0]!.id);
    expect(again.round).toBe(1);
  }, 60_000);

  it("web negotiations stay independent under the new unique index", async () => {
    const { startNegotiation } = await import("../lib/sellerAgent");
    const xs = await Promise.all([1, 2].map((i) => startNegotiation("film-camera", "HUMAN", `web${i}`, `w-${Math.random()}`)));
    xs.forEach((n) => made.push(n!.id));
    expect(new Set(xs.map((n) => n!.id)).size).toBe(2);
    expect(xs[0]!.channel).toBe("WEB");
  }, 60_000);
});
