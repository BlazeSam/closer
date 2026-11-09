import { describe, expect, it } from "vitest";
import { counterFor, evaluateOffer, type Decision, type PolicyListing, type PolicyState } from "../lib/policy";

const bike: PolicyListing = { askCents: 22000, floorCents: 17000, autoAcceptCents: 20000, currency: "USD" };
const st = (o: Partial<PolicyState> = {}): PolicyState => ({ round: 0, seed: "n1", ...o });

describe("floor-probe leak", () => {
  it("shown counter for mid-band offers is never below the offer and within [floor, ask]", () => {
    for (let round = 0; round < 6; round++)
      for (let o = bike.floorCents; o < bike.autoAcceptCents; o += 100) {
        const d = evaluateOffer(bike, st({ round }), o);
        if (d.type !== "NEEDS_APPROVAL") throw new Error("expected approval");
        expect(d.counterCents).toBeGreaterThan(o);
        expect(d.counterCents).toBeLessThanOrEqual(bike.askCents);
      }
  });
});

describe("evaluateOffer rules", () => {
  it("accepts at/above auto-accept", () => {
    expect(evaluateOffer(bike, st(), 20000)).toEqual({ type: "ACCEPT", priceCents: 20000 });
  });
  it("caps accept at ask when buyer overbids", () => {
    expect(evaluateOffer(bike, st(), 30000)).toEqual({ type: "ACCEPT", priceCents: 22000 });
  });
  it("accepts at last counter when buyer meets it", () => {
    expect(evaluateOffer(bike, st({ lastCounterCents: 19000 }), 19500)).toEqual({ type: "ACCEPT", priceCents: 19000 });
  });
  it("needs approval between floor and auto-accept, showing a counter above the offer", () => {
    expect(evaluateOffer(bike, st(), 18000)).toEqual({ type: "NEEDS_APPROVAL", priceCents: 18000, counterCents: 22000, final: false });
    expect(evaluateOffer(bike, st(), 17000).type).toBe("NEEDS_APPROVAL");
  });
  it("counters below floor, starting at ask", () => {
    expect(evaluateOffer(bike, st(), 10000)).toEqual({ type: "COUNTER", priceCents: 22000 });
  });
  it("counters descend but stay >= floor", () => {
    let last: number | undefined;
    for (let round = 0; round < 6; round++) {
      const d = evaluateOffer(bike, st({ round, lastCounterCents: last }), 10000) as { priceCents: number };
      expect(d.priceCents).toBeGreaterThanOrEqual(bike.floorCents);
      if (last !== undefined) expect(d.priceCents).toBeLessThanOrEqual(last);
      last = d.priceCents;
    }
  });
  it("final offer after max rounds", () => {
    expect(evaluateOffer(bike, st({ round: 6 }), 10000).type).toBe("FINAL_OFFER");
  });
  it("rejects invalid offers", () => {
    for (const o of [0, -5, 1.5, NaN, 22000 * 11]) expect(evaluateOffer(bike, st(), o)).toEqual({ type: "REJECT_INVALID" });
    expect(evaluateOffer(bike, st(), 20000, { offerCurrency: "EUR" })).toEqual({ type: "REJECT_INVALID" });
  });
  it("throws on bad listing config", () => {
    expect(() => evaluateOffer({ ...bike, floorCents: 21000 }, st(), 100)).toThrow();
  });
  it("jitter is stable per seed", () => {
    expect(counterFor(bike, st({ round: 3 }))).toBe(counterFor(bike, st({ round: 3 })));
  });
});

// Mulberry32 so failures reproduce.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("property: no decision is ever below floor", () => {
  it("holds over 1000 random listings and offer sequences", () => {
    const r = rng(42);
    for (let n = 0; n < 1000; n++) {
      const ask = 500 + Math.floor(r() * 200000);
      const floor = 1 + Math.floor(r() * (ask - 1));
      const auto = floor + Math.floor(r() * (ask - floor + 1));
      const l: PolicyListing = { askCents: ask, floorCents: floor, autoAcceptCents: auto, currency: "USD" };
      let round = 0;
      let lastCounterCents: number | undefined;
      for (let i = 0; i < 12; i++) {
        const offer = 1 + Math.floor(r() * ask * 1.3);
        const d: Decision = evaluateOffer(l, { round, lastCounterCents, seed: `s${n}` }, offer);
        if (d.type !== "REJECT_INVALID") {
          expect(d.priceCents).toBeGreaterThanOrEqual(floor);
          expect(d.priceCents).toBeLessThanOrEqual(ask);
        }
        if (d.type === "COUNTER" || d.type === "FINAL_OFFER") lastCounterCents = d.priceCents;
        round++;
      }
    }
  });
});

// A real buyer transcript walked the price from CA$300 down to CA$221 while never raising their
// offer above $150: the ladder advanced on every round, so stonewalling alone bought concessions.
describe("concessions must be bought", () => {
  const l = { askCents: 30000, floorCents: 22000, autoAcceptCents: 26000, currency: "CAD" };

  it("does not move while the buyer repeats the same offer", () => {
    let last: number | null = null;
    let prev: number | null = null;
    const seen: number[] = [];
    for (let round = 0; round < 6; round++) {
      const d = evaluateOffer(l, { round, lastCounterCents: last, seed: "n1", prevBuyerOfferCents: prev }, 10000);
      const price = "priceCents" in d ? d.priceCents : 0;
      seen.push(price);
      last = price;
      prev = 10000; // the buyer never improves
    }
    expect(new Set(seen.slice(1)).size, `counters: ${seen}`).toBe(1);
    expect(seen[seen.length - 1]).toBeGreaterThan(l.floorCents);
  });

  it("does not move while the buyer goes backwards", () => {
    const a = evaluateOffer(l, { round: 1, lastCounterCents: 28000, seed: "n2", prevBuyerOfferCents: 15000 }, 12500);
    expect("priceCents" in a && a.priceCents).toBe(28000);
  });

  it("still concedes when the buyer actually moves up", () => {
    const a = evaluateOffer(l, { round: 1, lastCounterCents: 28000, seed: "n3", prevBuyerOfferCents: 10000 }, 15000);
    expect("priceCents" in a && a.priceCents).toBeLessThan(28000);
  });

  it("never drops below the floor however long the buyer grinds", () => {
    let last: number | null = null;
    for (let round = 0; round < 40; round++) {
      const d = evaluateOffer(l, { round, lastCounterCents: last, seed: "n4", prevBuyerOfferCents: round * 100 }, round * 100 + 100);
      if ("priceCents" in d) {
        expect(d.priceCents).toBeGreaterThanOrEqual(l.floorCents);
        last = d.priceCents;
      }
    }
  });
});
