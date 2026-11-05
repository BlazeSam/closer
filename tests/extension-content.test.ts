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
    expect(read("extension/popup.html")).not.toMatch(/<input[^>]*id="auto"[^>]*checked/);
  });
});
