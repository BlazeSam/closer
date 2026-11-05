// Photo drafting is the one place a model is asked about prices. It cannot be run without credits,
// so the parts that CAN be tested without a provider are the ones that matter: the upload trust
// boundary, and the normalisation that stops a bad model answer producing an unsaveable listing.
import "dotenv/config";
import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, normalizeDraft, parseImageDataUrl, type Draft } from "../lib/listingDraft";

const base = (over: Partial<Draft> = {}): Draft => ({
  title: "Film camera",
  description: "A camera.",
  condition: "Good",
  notes: "",
  askDollars: 200,
  autoAcceptDollars: 180,
  floorDollars: 150,
  rationale: "Comparable listings.",
  ...over,
});

const dataUrl = (type: string, bytes: number) => `data:${type};base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;

describe("image upload boundary", () => {
  it("accepts the allowed image types", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp"]) expect(parseImageDataUrl(dataUrl(t, 1000)).ok, t).toBe(true);
  });

  it("rejects types that are not images, however they are dressed up", () => {
    for (const t of ["text/html", "image/svg+xml", "application/pdf", "image/jpeg; charset=x"]) {
      expect(parseImageDataUrl(dataUrl(t, 100)).ok, t).toBe(false);
    }
  });

  it("rejects anything that is not a base64 data URL", () => {
    for (const v of ["https://example.com/a.jpg", "javascript:alert(1)", "", null, undefined, 42, {}]) {
      expect(parseImageDataUrl(v as unknown).ok, String(v)).toBe(false);
    }
  });

  it("rejects an oversized image with 413", () => {
    const r = parseImageDataUrl(dataUrl("image/png", MAX_IMAGE_BYTES + 10_000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });
});

describe("draft normalisation", () => {
  it("keeps a sane draft as it is", () => {
    const d = normalizeDraft(base());
    expect([d.floorDollars, d.autoAcceptDollars, d.askDollars]).toEqual([150, 180, 200]);
  });

  it("forces floor <= autoAccept <= ask when the model gets the order wrong", () => {
    const d = normalizeDraft(base({ askDollars: 100, autoAcceptDollars: 500, floorDollars: 900 }));
    expect(d.floorDollars).toBeLessThanOrEqual(d.autoAcceptDollars);
    expect(d.autoAcceptDollars).toBeLessThanOrEqual(d.askDollars);
    expect(d.askDollars).toBe(100);
  });

  it("rounds to whole dollars and never goes below one", () => {
    const d = normalizeDraft(base({ askDollars: 10.4, autoAcceptDollars: 0.2, floorDollars: 0.1 }));
    expect(Number.isInteger(d.askDollars)).toBe(true);
    expect(d.floorDollars).toBeGreaterThanOrEqual(1);
    expect(d.autoAcceptDollars).toBeGreaterThanOrEqual(1);
  });

  it("survives non-finite numbers", () => {
    const d = normalizeDraft(base({ askDollars: NaN, autoAcceptDollars: Infinity, floorDollars: -5 }));
    for (const v of [d.askDollars, d.autoAcceptDollars, d.floorDollars]) expect(Number.isFinite(v) && v >= 1).toBe(true);
    expect(d.floorDollars).toBeLessThanOrEqual(d.autoAcceptDollars);
    expect(d.autoAcceptDollars).toBeLessThanOrEqual(d.askDollars);
  });

  it("trims overlong text and defaults a blank condition", () => {
    const d = normalizeDraft(base({ title: "x".repeat(500), description: "y".repeat(2000), condition: "   " }));
    expect(d.title.length).toBeLessThanOrEqual(120);
    expect(d.description.length).toBeLessThanOrEqual(600);
    expect(d.condition).toBe("Used");
  });

  it("produces a draft the listing API would accept", () => {
    // app/api/seller/listings validates floor <= autoAccept <= ask; a draft must never fail it.
    for (const over of [{ askDollars: 1, autoAcceptDollars: 1, floorDollars: 1 }, { askDollars: 5, autoAcceptDollars: 999, floorDollars: 999 }, { askDollars: 1e9, autoAcceptDollars: 1, floorDollars: 1 }]) {
      const d = normalizeDraft(base(over));
      expect(d.floorDollars <= d.autoAcceptDollars && d.autoAcceptDollars <= d.askDollars, JSON.stringify(d)).toBe(true);
    }
  });
});
