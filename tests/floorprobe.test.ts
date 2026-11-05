// A buyer sees only (kind, shown price). Prove that offers below floor and offers in [floor, auto)
// look identical, so no probing sequence can locate the floor.
import { describe, expect, it } from "vitest";
import { evaluateOffer, type Decision, type PolicyListing } from "../lib/policy";

const bike: PolicyListing = { askCents: 22000, floorCents: 17000, autoAcceptCents: 20000, currency: "USD" };

// What the buyer can observe from a decision.
const observe = (d: Decision) =>
  d.type === "NEEDS_APPROVAL" ? { kind: d.final ? "FINAL" : "COUNTER", price: d.counterCents }
  : d.type === "COUNTER" ? { kind: "COUNTER", price: d.priceCents }
  : d.type === "FINAL_OFFER" ? { kind: "FINAL", price: d.priceCents }
  : { kind: d.type, price: "priceCents" in d ? d.priceCents : 0 };

describe("floor probe", () => {
  it("offers on both sides of the floor are indistinguishable", () => {
    for (let round = 0; round <= 6; round++) {
      const st = { round, seed: "probe" };
      const sched = observe(evaluateOffer(bike, st, 100)).price as number;
      // Every offer more than $1 under the shown counter must produce the exact same observation.
      for (let o = 100; o < Math.min(sched - 100, bike.autoAcceptCents); o += 100) {
        expect(observe(evaluateOffer(bike, st, o)), `round ${round} offer ${o}`).toEqual(observe(evaluateOffer(bike, st, 100)));
      }
    }
  });

  it("scripted binary search learns nothing about the floor", () => {
    // Search for the point where the response changes; there must be none below auto-accept except
    // the shown counter itself, which is >= floor by construction.
    const st = { round: 3, seed: "probe" };
    let lo = 100, hi = bike.autoAcceptCents - 100;
    const base = observe(evaluateOffer(bike, st, lo));
    while (hi - lo > 100) {
      const mid = Math.floor((lo + hi) / 200) * 100;
      const same = JSON.stringify(observe(evaluateOffer(bike, st, mid))) === JSON.stringify(base);
      if (same) lo = mid; else hi = mid;
    }
    // Response only changes within $1 of the counter the buyer was already told, never at the floor.
    expect(Math.abs(hi - (base.price as number))).toBeLessThanOrEqual(200);
  });
});
