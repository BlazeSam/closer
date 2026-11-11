import { describe, expect, it } from "vitest";
import { extractAmounts, replyIsClean } from "../lib/guard";
import { verifyCapture } from "../lib/paypal";

describe("extractAmounts", () => {
  const cases: [string, number[]][] = [
    ["I can do $200.", [200]],
    ["How about 200 bucks?", [200]],
    ["200 USD works", [200]],
    ["USD 1,250.50", [1250.5]],
    ["maybe $2k", [2000]],
    ["two hundred fifty dollars", [250]],
    ["two hundred and five", [205]],
    ["one thousand two hundred", [1200]],
    ["２００ dollars", [200]],
    ["Hello there, nice bike!", []],
  ];
  for (const [text, want] of cases) it(text, () => expect(extractAmounts(text)).toEqual(want));
});

describe("replyIsClean", () => {
  it("allows issued prices only", () => {
    expect(replyIsClean("Deal at $200", [20000])).toBe(true);
    expect(replyIsClean("Deal at $150", [20000])).toBe(false);
    expect(replyIsClean("I'll go to one hundred fifty", [20000])).toBe(false);
  });
});

describe("verifyCapture", () => {
  const cap = (value: string, cur = "USD", status = "COMPLETED") => ({
    id: "O1",
    status,
    purchase_units: [{ payments: { captures: [{ id: "C1", status, amount: { currency_code: cur, value } }] } }],
  });
  it("accepts matching capture", () => expect(verifyCapture(cap("200.00"), 20000, "USD")).toEqual({ ok: true, captureId: "C1" }));
  it("rejects wrong amount", () => expect(verifyCapture(cap("1.00"), 20000, "USD").ok).toBe(false));
  it("rejects wrong currency", () => expect(verifyCapture(cap("200.00", "EUR"), 20000, "USD").ok).toBe(false));
  it("rejects incomplete", () => expect(verifyCapture(cap("200.00", "USD", "PENDING"), 20000, "USD").ok).toBe(false));
});

// Regression: a missing price used to erase the placeholder, producing "I can't accept  for this item."
describe("placeholder substitution", () => {
  it("never leaves a hole where a price belongs", async () => {
    const { substitute } = await import("../lib/replies");
    for (const t of ["I can't accept {price} for this item.", "The asking price is {ask}."]) {
      const out = substitute(t, {}, "CAD");
      expect(out).not.toMatch(/\s\s|\s\./);
      expect(out).not.toContain("{");
    }
    expect(substitute("{price}", { price: 18000 }, "CAD")).toBe("CA$180");
  });
});

describe("claimsDeal", () => {
  it("catches a reply that says the offer was accepted", async () => {
    const { claimsDeal } = await import("../lib/guard");
    for (const t of [
      "Good news: your offer of CA$165 is accepted for the Canon AE-1.",
      "Deal! CA$251 it is. You can pay securely with PayPal below.",
      "I can accept your offer of CA$165.",
      "Great, it's a deal.",
    ]) expect(claimsDeal(t), t).toBe(true);
  });
  it("leaves counters and refusals alone", async () => {
    const { claimsDeal } = await import("../lib/guard");
    for (const t of [
      "I can't accept CA$100, but I could meet you at CA$180.",
      "I cannot accept your offer, the best I can do is CA$180.",
      "That's a great deal for a working AE-1. The asking price is CA$180.",
      "If you can do CA$170, we have a deal.",
      "Let me check with the seller on that. One moment...",
    ]) expect(claimsDeal(t), t).toBe(false);
  });
});
