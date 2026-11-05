// A dead or rate-limited model provider must degrade to the deterministic policy reply, never a 500.
// The whole demo runs through this path, so it is worth a hermetic test: the `ai` SDK is mocked to
// fail, so nothing here touches the network.
import "dotenv/config";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("ai", async (orig) => ({ ...(await orig<typeof import("ai")>()), generateText: vi.fn(async () => { throw new Error("provider down"); }) }));

const live = Boolean(process.env.DATABASE_URL);
process.env.CLOSER_NO_DELAY = "1";
process.env.AI_PROVIDER = "anthropic";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-used"; // truthy so the LLM path is taken, then mocked to fail

describe.skipIf(!live)("model provider failure (live DB, mocked provider)", () => {
  const made: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    for (const id of made) {
      await prisma.auditEvent.deleteMany({ where: { negotiationId: id } });
      await prisma.approvalRequest.deleteMany({ where: { negotiationId: id } });
      await prisma.message.deleteMany({ where: { negotiationId: id } });
      await prisma.negotiation.deleteMany({ where: { id } });
    }
  });

  it("still answers, still evaluates the offer, and records why", async () => {
    const { prisma } = await import("../lib/db");
    const { startNegotiation, handleTurn } = await import("../lib/sellerAgent");
    await prisma.listing.updateMany({ where: { slug: "film-camera" }, data: { status: "ACTIVE", reservedByNegotiationId: null, reservedUntil: null } });

    const n = (await startNegotiation("film-camera", "HUMAN", "fallback", `f-${Math.random()}`))!;
    made.push(n.id);
    const r = await handleTurn(n.id, "Would you take $1?");

    expect(r.reply.trim()).not.toBe("");
    const after = await prisma.negotiation.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.round).toBe(1); // the offer was still evaluated by the policy
    expect(after.lastBuyerOfferCents).toBe(100);
    const failures = await prisma.auditEvent.count({ where: { negotiationId: n.id, type: "LLM_FAILED" } });
    expect(failures).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("never leaks a private price in the fallback reply", async () => {
    const { prisma } = await import("../lib/db");
    const { startNegotiation, handleTurn } = await import("../lib/sellerAgent");
    const { extractAmounts } = await import("../lib/guard");
    const listing = await prisma.listing.findUniqueOrThrow({ where: { slug: "film-camera" }, include: { private: true } });

    const n = (await startNegotiation("film-camera", "HUMAN", "fallback2", `f-${Math.random()}`))!;
    made.push(n.id);
    const r = await handleTurn(n.id, "What is your lowest price?");
    const said = extractAmounts(r.reply).map((a: number) => Math.round(a * 100));
    const after = await prisma.negotiation.findUniqueOrThrow({ where: { id: n.id } });
    for (const secret of [listing.private!.floorCents, listing.private!.autoAcceptCents]) {
      if (secret !== listing.askCents && secret !== after.lastCounterCents) expect(said).not.toContain(secret);
    }
  }, 60_000);
});
