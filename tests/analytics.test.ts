import { describe, expect, it } from "vitest";
import { computeAnalytics, median } from "../lib/analytics";

const L = [{ id: "a", title: "Bike", askCents: 10000, currency: "USD" }, { id: "b", title: "Lamp", askCents: 2000, currency: "USD" }];
const base = { paid: false, round: 2, agreedCents: null, bestOfferCents: null, firstMessageAt: 0, agreedAt: null };

describe("analytics", () => {
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
  it("handles empty data without NaN", () => {
    const r = computeAnalytics([], []);
    expect(r.totals.sellThroughPct).toBeNull();
    expect(r.totals.avgDealPctOfAsk).toBeNull();
    expect(r.perChannel.every((c) => c.items === 0 && c.medianMinutesToDeal === null)).toBe(true);
  });
  it("computes deals and channels", () => {
    const r = computeAnalytics(L, [
      { ...base, listingId: "a", channel: "Facebook", status: "PAID", paid: true, agreedCents: 9000, agreedAt: 10 * 60000 },
      { ...base, listingId: "a", channel: "Web chat", status: "OPEN", bestOfferCents: 7000 },
      { ...base, listingId: "b", channel: "Web chat", status: "OPEN", bestOfferCents: 1500 },
      { ...base, listingId: "b", channel: "Facebook", status: "OPEN", bestOfferCents: 115000 }, // typo offer above asking: ignored
    ]);
    expect(r.totals).toMatchObject({ items: 2, agreedItems: 1, paidItems: 1, sellThroughPct: 50, avgDealPctOfAsk: 90, medianMinutesToDeal: 10, avgRounds: 2 });
    expect(r.perChannel.find((c) => c.channel === "Facebook")?.sellThroughPct).toBe(50);
    expect(r.perChannel.find((c) => c.channel === "Web chat")?.sellThroughPct).toBe(0);
    expect(r.perItem[0]).toMatchObject({ status: "paid", priceCents: 9000, pctOfAsk: 90, negotiations: 2 });
    expect(r.perItem[1]).toMatchObject({ status: "listed", priceCents: 1500, pctOfAsk: 75 });
  });
});
