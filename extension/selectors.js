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
  // Seen on 11 Nov 2026: each message is a div with data-message-id="mid.…", aria-roledescription="message"
  // and aria-label "At 10:43 AM, You: <text>" inside [role="log"]. System lines ("You started this chat")
  // have the same wrapper but no text bubble, so keep only nodes with a div[dir="auto"] bubble.
  messages: () =>
    [...document.querySelectorAll('[role="log"] [data-message-id][aria-roledescription="message"]')].filter((el) =>
      el.querySelector('div[dir="auto"]'),
    ),
  // Both must agree, else not inbound: the label/heading does not say "You" (English UI only), AND the
  // bubble sits left of the log's centre. A zero rect (hidden, not laid out) fails closerRectIsInbound.
  isInbound: (el) => {
    const mine = /^At [^,]*, You:/.test(el.getAttribute("aria-label") || "") || /^You sent/.test(el.querySelector("h4")?.textContent || "");
    const log = document.querySelector('[role="log"]')?.getBoundingClientRect();
    return !mine && closerRectIsInbound(log, el.querySelector('div[dir="auto"]').getBoundingClientRect());
  },
  text: (el) => [...el.querySelectorAll('div[dir="auto"]')].map((d) => d.textContent).join("\n").trim(),
  id: (el) => el.getAttribute("data-message-id") || null,
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

// ---- Reading YOUR OWN listing page, for "Add to Closer" (listing.js). Read-only. Unknown means null. ----

// Pure: "CA$1,200", "$150.00", "€80" -> whole dollars; "Free" or no number -> null.
function closerParsePrice(s) {
  const m = /(?:[$€£]|CA\$|C\$)\s?(\d[\d,]*(?:\.\d{1,2})?)/.exec(String(s || ""));
  const n = m ? Math.round(Number(m[1].replace(/,/g, ""))) : NaN;
  return n > 0 ? n : null;
}

const closerMeta = (prop) => document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.getAttribute("content")?.trim() || null;
const closerVisible = (el) => Boolean(el && el.getClientRects().length);

// Facebook Marketplace item page. Seen 11 Nov 2026 on the owner's own listing, opened from a share link as
// /commerce/listing/<id>/ (also /marketplace/item/<id>/). No [role="main"] and no og: tags on that page.
// Title is the visible h1; price a leaf span "CA$150"; photo img[alt^="Product photo of"]. Under "Details" sits a
// row "Condition" / "New", then the description as a span[dir=auto], then the location line.
const CLOSER_FB_LISTING = {
  source: "facebook",
  matches: () => location.hostname === "www.facebook.com" && /^\/(marketplace\/item|commerce\/listing)\/\d+/.test(location.pathname),
  read: () => {
    const root = document.querySelector('[role="main"]') || document.body;
    const title = [...root.querySelectorAll("h1")].find(closerVisible)?.textContent?.trim() || closerMeta("og:title");
    const priceEl = [...root.querySelectorAll("span")].find((el) => !el.children.length && closerVisible(el) && /^\s*(CA|C)?[$€£]\s?\d/.test(el.textContent || ""));
    // The condition row is the first ancestor of the "Condition" label that also holds the value. The description
    // is the nearest visible span[dir=auto] outside that row, within a few levels up (not the location line).
    const label = [...root.querySelectorAll("span")].find((el) => closerVisible(el) && (el.textContent || "").trim() === "Condition");
    let row = label;
    while (row && row.innerText.trim() === "Condition") row = row.parentElement;
    const condition = row ? row.innerText.split("\n").map((t) => t.trim()).find((t) => t && t !== "Condition") || null : null;
    const isDesc = (el) => closerVisible(el) && !row.contains(el) && (el.textContent || "").trim() && !/Location is approximate/i.test(el.textContent);
    let descEl = null;
    for (let up = row?.parentElement, i = 0; up && !descEl && i < 6; up = up.parentElement, i++) descEl = [...up.querySelectorAll('span[dir="auto"]')].find(isDesc) || null;
    // Opened from a share link the photo has alt "Product photo of <title>"; opened directly it had no alt at all,
    // so fall back to the largest fbcdn image (avatars are 100px).
    const big = [...root.querySelectorAll('img[src*="fbcdn.net"]')].filter((i) => i.naturalWidth >= 300).sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
    const img = root.querySelector('img[alt^="Product photo of"]')?.src || big?.src || closerMeta("og:image");
    return {
      title: title ? title.slice(0, 120) : null,
      price: closerParsePrice(priceEl?.textContent) ?? closerParsePrice(closerMeta("og:title")),
      description: descEl?.textContent?.trim() || closerMeta("og:description"),
      condition: condition ? condition.slice(0, 60) : null,
      imageUrl: img && img.startsWith("https://") ? img : null,
    };
  },
};

function closerListingPage() {
  return [CLOSER_FB_LISTING].find((p) => p.matches()) || null;
}
