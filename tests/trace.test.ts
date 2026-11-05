// The buyer-facing trace is a leak surface: the raw audit log contains the policy branch (which
// reveals where an offer sits against the hidden floor) and the guard-blocked reply text.
import { describe, expect, it } from "vitest";
import { INVARIANTS, redactForBuyer, type RawEvent } from "../lib/trace";

const at = new Date("2026-11-05T12:00:00Z");
const ev = (type: string, payload: unknown): RawEvent => ({ type, payload, createdAt: at });

const FLOOR = 17000;
const AUTO = 20000;

describe("buyer trace redaction", () => {
  it("never reveals which policy branch ran", () => {
    const branches = ["ACCEPT", "NEEDS_APPROVAL", "COUNTER", "FINAL_OFFER", "REJECT_INVALID"];
    for (const type of branches) {
      const json = JSON.stringify(
        redactForBuyer([ev("POLICY_DECISION", { offerCents: 18000, round: 0, decision: { type, priceCents: 18000, counterCents: 19000 } })], "USD"),
      );
      for (const b of branches) expect(json, `leaked ${b} for ${type}`).not.toContain(b);
      expect(json).not.toContain("19000");
      expect(json).not.toContain("190.00");
    }
  });

  it("never echoes a guard-blocked reply, which is blocked for containing a price", () => {
    const json = JSON.stringify(redactForBuyer([ev("GUARD_TRIGGERED", { reply: `I could do $${FLOOR / 100} for you`, attempt: 1 })], "USD"));
    expect(json).not.toContain(String(FLOOR / 100));
    expect(json).not.toContain("could do");
  });

  it("never echoes provider error text", () => {
    const json = JSON.stringify(redactForBuyer([ev("LLM_FAILED", { error: "401 from api.anthropic.com: credit balance too low" })], "USD"));
    expect(json).not.toContain("anthropic");
    expect(json).not.toContain("401");
  });

  it("drops seller-only and unknown events entirely", () => {
    const entries = redactForBuyer(
      [ev("APPROVAL_RESOLVED", { approve: true, offerCents: 18000 }), ev("ASK_SELLER", { question: "hold it?" }), ev("DEAL_REVIVED", {}), ev("SOMETHING_NEW", { floorCents: FLOOR })],
      "USD",
    );
    expect(entries).toHaveLength(0);
  });

  it("no private price survives, whatever the payload carries", () => {
    const hostile: RawEvent[] = [
      ev("POLICY_DECISION", { offerCents: 100, round: 0, floorCents: FLOOR, autoAcceptCents: AUTO }),
      ev("GUARD_TRIGGERED", { reply: "x", attempt: 2, replaced: true, floorCents: FLOOR }),
      ev("PAYPAL_ORDER_CREATED", { orderId: "X", agreedCents: AUTO, floorCents: FLOOR }),
    ];
    const json = JSON.stringify(redactForBuyer(hostile, "USD"));
    for (const secret of [FLOOR, AUTO, FLOOR / 100, AUTO / 100]) expect(json).not.toContain(String(secret));
  });

  it("still shows the buyer their own offer and the useful beats", () => {
    const entries = redactForBuyer(
      [ev("POLICY_DECISION", { offerCents: 10000, round: 1, decision: { type: "COUNTER", priceCents: 21000 } }), ev("GUARD_TRIGGERED", { reply: "bad", attempt: 2, replaced: true }), ev("PAYPAL_CAPTURED", { captureId: "C1" })],
      "USD",
    );
    expect(entries.map((e) => e.kind)).toEqual(["policy", "guard", "payment"]);
    expect(entries[0].detail).toContain("$100");
    expect(entries[0].detail).toContain("round 2");
    expect(entries[1].label).toContain("replaced");
  });

  it("states the invariants a judge should be able to read", () => {
    expect(INVARIANTS.join(" ")).toMatch(/never receives/i);
    expect(INVARIANTS.length).toBeGreaterThanOrEqual(3);
  });
});
