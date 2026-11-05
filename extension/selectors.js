// ALL platform-specific DOM knowledge lives in this one file.
//
// The MOCK selectors target the stable data-closer-* hooks documented in components/MockMarketplace.tsx.
// Those are ours and will not move.
//
// The FACEBOOK selectors are best guesses and are EXPECTED TO BREAK: Facebook ships DOM changes without
// notice and uses generated class names. When drafting stops working on facebook.com, THIS is the file to fix
// (inspect the thread, update messages/isInbound/composer/send below). content.js should not need to change.
// They have not been verified against the live site.
//
// Each platform implements: channel, matches(), threadId(), messages(), isInbound(el), text(el), id(el)
// (stable id or null), composer(), send(), listingHint() (optional default listing slug).

const CLOSER_MOCK = {
  channel: "MOCK",
  matches: () => Boolean(document.querySelector("[data-closer-thread]")),
  threadId: () => document.querySelector("[data-closer-thread]")?.getAttribute("data-closer-thread") || null,
  listingHint: () => document.querySelector("[data-closer-thread]")?.getAttribute("data-closer-listing") || null,
  messages: () => [...document.querySelectorAll("[data-closer-messages] [data-closer-message]")],
  isInbound: (el) => el.getAttribute("data-closer-role") === "buyer",
  text: (el) => (el.textContent || "").trim(),
  id: (el) => el.getAttribute("data-closer-id"),
  composer: () => document.querySelector("[data-closer-composer]"),
  send: () => document.querySelector("[data-closer-send]"),
};

const CLOSER_FACEBOOK = {
  channel: "FB_MARKETPLACE",
  matches: () => location.hostname === "www.facebook.com" && location.pathname.startsWith("/messages/"),
  // /messages/t/<id>/ or /messages/e2ee/t/<id>/
  threadId: () => /\/messages\/(?:e2ee\/)?t\/([^/?#]+)/.exec(location.pathname)?.[1] || null,
  messages: () => [...document.querySelectorAll('[role="main"] [role="row"] div[dir="auto"]')],
  // Facebook marks no direction in the DOM we can rely on. Heuristic: your own messages sit on the right.
  isInbound: (el) => {
    const main = document.querySelector('[role="main"]')?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return Boolean(main) && r.left + r.width / 2 < main.left + main.width / 2;
  },
  text: (el) => (el.textContent || "").trim(),
  id: () => null,
  composer: () => document.querySelector('[role="main"] div[contenteditable="true"][role="textbox"]'),
  send: () => document.querySelector('[role="main"] [aria-label="Press enter to send"], [role="main"] [aria-label="Send"]'),
};

function closerPlatform() {
  return [CLOSER_MOCK, CLOSER_FACEBOOK].find((p) => p.matches()) || null;
}
