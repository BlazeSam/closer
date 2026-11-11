// ALL platform-specific DOM knowledge lives in this one file.
//
// The MOCK selectors target the stable data-closer-* hooks documented in components/MockMarketplace.tsx.
// Those are ours and will not move.
//
// The FACEBOOK selectors are best guesses and are EXPECTED TO BREAK: Facebook ships DOM changes without
// notice and uses generated class names. When drafting stops working on facebook.com, THIS is the file to fix
// (inspect the thread, update messages/isInbound/composer/send below). content.js should not need to change.
// They have not been verified against the live site. The KIJIJI set further down is the same: unverified.
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

// Pure so it can be tested without a DOM. A hidden, collapsed or not-yet-laid-out node reports a zero
// rect at 0,0, which lands left of centre and would read as the buyer; with auto-send on the agent
// would then answer its own message. Unknown direction must mean "not inbound": never reply.
function closerRectIsInbound(main, r) {
  if (!main || !r || main.width <= 0 || r.width <= 0 || r.height <= 0) return false;
  return r.left + r.width / 2 < main.left + main.width / 2;
}

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
    // A hidden, collapsed or not-yet-laid-out node reports a zero rect at 0,0, which lands left of
    // centre and would read as the buyer. With auto-send on, the agent would then answer its own
    // message. Unknown direction must mean "not inbound": the safe failure is never replying.
    return closerRectIsInbound(main, r);
  },
  text: (el) => (el.textContent || "").trim(),
  id: () => null,
  composer: () => document.querySelector('[role="main"] div[contenteditable="true"][role="textbox"]'),
  send: () => document.querySelector('[role="main"] [aria-label="Press enter to send"], [role="main"] [aria-label="Send"]'),
};

// KIJIJI: UNVERIFIED GUESSES, written without being able to log in to kijiji.ca. Expected to break; fix here.
// Deliberately uses roles / aria / textarea / contenteditable rather than Kijiji's generated class names.
// Direction is guessed from screen position (same rule as Facebook); unknown means "not inbound".
const CLOSER_KIJIJI = {
  channel: "KIJIJI",
  matches: () => location.hostname === "www.kijiji.ca" && location.pathname.startsWith("/m-msg-my-messages"),
  // Guess: /m-msg-my-messages/.../conversation/<id> or a ?conversationId=<id> style query.
  threadId: () =>
    /\/conversations?\/([^/?#]+)/.exec(location.pathname)?.[1] ||
    ["conversationId", "conversation", "threadId", "id"].map((k) => new URLSearchParams(location.search).get(k)).find(Boolean) ||
    null,
  messages: () => [
    ...document.querySelectorAll(
      '[role="log"] [role="listitem"], [role="log"] li, [aria-live] li, [data-testid*="message" i], [class*="message-bubble" i], [class*="messageBubble" i], [class*="MessageBubble"]',
    ),
  ],
  isInbound: (el) => {
    const main = (document.querySelector('[role="main"], main') || document.body).getBoundingClientRect();
    return closerRectIsInbound(main, el.getBoundingClientRect());
  },
  text: (el) => (el.textContent || "").trim(),
  // Only a real per-message id. data-testid is the same on every message, so using it as the key would mark
  // the thread handled after the first reply and the extension would go silent. null falls back to count+text.
  id: (el) => el.getAttribute("data-message-id") || null,
  composer: () =>
    document.querySelector('[role="main"] textarea, main textarea, [role="main"] [contenteditable="true"], main [contenteditable="true"], textarea[aria-label*="message" i], textarea[placeholder*="message" i]'),
  send: () =>
    document.querySelector('button[aria-label*="send" i], [role="button"][aria-label*="send" i], form button[type="submit"]') ||
    [...document.querySelectorAll("button")].find((b) => /^send$/i.test((b.textContent || "").trim())) ||
    null,
};

function closerPlatform() {
  return [CLOSER_MOCK, CLOSER_FACEBOOK, CLOSER_KIJIJI].find((p) => p.matches()) || null;
}
