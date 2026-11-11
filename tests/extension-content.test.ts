// Checks for the browser extension that need no browser: reply-target selection, drift between the mock page's
// DOM hooks and extension/selectors.js, and the safety properties of the manifest / popup defaults.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const { pickInbound } = createRequire(import.meta.url)("../extension/content.js") as {
  pickInbound: (m: { inbound: boolean; text: string }[]) => { text: string } | null;
};

describe("pickInbound", () => {
  it("replies only when the newest message is from the buyer", () => {
    expect(pickInbound([{ inbound: true, text: "hi" }, { inbound: false, text: "hello" }])).toBeNull(); // seller already answered
    expect(pickInbound([{ inbound: false, text: "hello" }, { inbound: true, text: "150?" }])?.text).toBe("150?");
    expect(pickInbound([])).toBeNull();
    expect(pickInbound([{ inbound: true, text: "" }])).toBeNull();
  });
});

describe("extension wiring", () => {
  it("every data-closer-* hook the mock selectors use exists on the mock page", () => {
    const used = new Set(read("extension/selectors.js").split("const CLOSER_FACEBOOK")[0].match(/data-closer-[a-z]+/g));
    const page = read("components/MockMarketplace.tsx");
    for (const hook of used) expect(page, hook).toContain(hook);
  });

  it("auto-send defaults off, the token never goes in a URL, and permissions stay minimal", () => {
    expect(read("extension/popup.js")).toContain("autoSend === true");
    expect(read("extension/content.js")).toContain("autoSend === true");
    const bg = read("extension/background.js");
    expect(bg).not.toMatch(/fetch\(`[^`]*token/); // POST body only
    expect(bg).toContain("body: JSON.stringify({ token,");
    const m = JSON.parse(read("extension/manifest.json"));
    expect(m.permissions).toEqual(["storage"]);
    expect(m.host_permissions).toContain("https://www.facebook.com/messages/*");
    expect(m.host_permissions).toEqual(expect.arrayContaining(["https://closer-9a91.onrender.com/*", "https://www.kijiji.ca/m-msg-my-messages/*"]));
    expect(m.content_scripts[0].matches).toContain("https://closer-9a91.onrender.com/demo/marketplace*");
    expect(m.content_scripts[0].matches).toContain("https://www.kijiji.ca/m-msg-my-messages/*");
    expect(bg).toContain('"KIJIJI"');
    expect(read("extension/selectors.js")).toContain('channel: "KIJIJI"');
    expect(read("extension/popup.html")).not.toMatch(/<input[^>]*id="auto"[^>]*checked/);
  });
});

// A zero rect used to read as inbound, so with auto-send on the agent could answer its own message.
describe("facebook direction heuristic", () => {
  const fn = new Function(`${read("extension/selectors.js")}; return closerRectIsInbound;`)() as (
    m: { left: number; width: number } | null,
    r: { left: number; width: number; height: number } | null,
  ) => boolean;
  const main = { left: 0, width: 1000 };

  it("reads a left-hand message as the buyer and a right-hand one as the seller", () => {
    expect(fn(main, { left: 10, width: 200, height: 20 })).toBe(true);
    expect(fn(main, { left: 700, width: 200, height: 20 })).toBe(false);
  });

  it("never calls an unmeasurable node inbound", () => {
    for (const r of [{ left: 0, width: 0, height: 0 }, { left: 0, width: 200, height: 0 }, null]) {
      expect(fn(main, r), JSON.stringify(r)).toBe(false);
    }
    expect(fn(null, { left: 10, width: 200, height: 20 })).toBe(false);
    expect(fn({ left: 0, width: 0 }, { left: 10, width: 200, height: 20 })).toBe(false);
  });
});

describe("listing page reader", () => {
  const parse = new Function(`${read("extension/selectors.js")}; return closerParsePrice;`)() as (s: unknown) => number | null;

  it("reads marketplace price text and treats free or missing as unknown", () => {
    expect(parse("CA$1,200")).toBe(1200);
    expect(parse("$150.00")).toBe(150);
    expect(parse("C$ 80")).toBe(80);
    expect(parse("Free")).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse("$0")).toBeNull();
  });

  it("injects the reader only on marketplace pages, never with the reply drafter", () => {
    const m = JSON.parse(read("extension/manifest.json"));
    const entry = m.content_scripts.find((c: { js: string[] }) => c.js.includes("listing.js"));
    expect(entry.matches).toEqual(["https://www.facebook.com/marketplace/*", "https://www.facebook.com/commerce/listing/*"]);
    expect(entry.js).not.toContain("content.js");
    expect(m.host_permissions).toContain("https://www.facebook.com/marketplace/*");
  });
});
