# Plan: Closer where sellers already sell (extension + invoice)

Written 2026-11-05. Supersedes the "share a Closer link" story for Marketplace-style channels.
Read this with [SCOPE.md](../SCOPE.md); everything in SCOPE section 2 (the AI talks, the code
decides) still holds and is never relaxed by anything here.

## Why the direction changed

The old pitch was "create a listing, get `/l/<slug>`, paste the link into your Marketplace ad."
That does not survive contact with reality:

- Marketplace/Craigslist/Kijiji discourage or strip outbound links and expect buyers to chat
  in-platform. The seller cannot rely on the link being seen at all.
- A stranger sending an unfamiliar payment domain is the exact shape of the known Marketplace
  payment scam. Buyers are trained to refuse it. `closer-xyz.onrender.com` reads as phishing no
  matter how good the page is.

The trust problem is the **unknown domain**, not leaving the platform. `paypal.com` is also
off-platform and buyers trust it. So: keep the agent where the buyer already is (extension),
and move money through PayPal's own surface (invoice).

## Target flow

1. Seller opens Closer and the landing page explains the product in one screen.
2. Seller creates a listing: title, photos, ask, private floor, private auto-accept.
3. Listing page offers **Connect to Facebook**: install the extension, pair it, link this
   listing to a Marketplace thread.
4. Buyer messages on Marketplace. The extension reads the message, sends it to Closer, and the
   existing policy + seller agent produce the reply.
5. The reply appears as a **draft in the composer**. The seller presses send. Auto-send is an
   opt-in toggle, off by default.
6. Mid-band offers raise a shadow approval; the seller approves on the dashboard (already built).
7. Deal closes. Seller gets an **email**.
8. Buyer pays through a **PayPal invoice** sent to their email. Buyer pays on paypal.com.

## Decisions already made (do not relitigate)

| Question | Decision |
|---|---|
| Send mode | Draft by default, auto-send an opt-in toggle. A human sends every message unless they explicitly turn that off. |
| Demo target | Build a **mock marketplace page** in-app so judges can try it live; record real Facebook in the video. |
| Payment | **Both paths.** Invoice for buyers met on Marketplace/Kijiji; the existing hosted checkout stays for buyers who arrived via a Closer link or a buyer agent. No existing code is thrown away. |
| Installments | PayPal Pay Later. **Stretch, after everything else works.** Not on the critical path. |
| Deal notification | Email (Resend). |

## Build order

Each step ships on its own. Stop at the deadline, not mid-step.

### 1. Thread-aware negotiations (backend, no UI) -- DONE (ccd36e7)
Negotiations currently key off a web session. An extension thread needs its own identity.

- `Negotiation`: add `channel` (`WEB` | `FB_MARKETPLACE` | `KIJIJI` | `MOCK`, default `WEB`) and
  `externalThreadId String?`. Add `@@unique([listingId, externalThreadId])` so one Marketplace
  thread maps to exactly one negotiation.
- Find-or-create by `(listingId, externalThreadId)`; everything downstream (`handleTurn`,
  `applyOffer`, shadow approvals, dashboard) is unchanged.

### 2. Extension pairing + reply endpoint -- DONE (see below; dashboard UI for minting still open)
- `SellerToken` table: random token, `sellerId`, `createdAt`, `revokedAt?`. The seller generates
  one on the dashboard and pastes it into the extension. **Never ship `SELLER_PASSWORD` to the
  extension.**
- `POST /api/extension/reply` — body `{ token, channel, threadId, listingSlug, buyerMessage }`,
  returns `{ reply, status, checkoutUrl?, invoiceUrl? }`. Auth by token, rate limited per token.
  Internally this is `handleTurn` and nothing more.

### 3. Mock marketplace page (`/demo/marketplace`)
A fake Marketplace-style chat served by Closer. Same DOM hooks the real content script targets,
so the extension works on it unmodified. This is what judges click, and what you test against
when Facebook's DOM shifts.

### 4. The extension (MV3, unpacked)
- `content.js` on the mock page and `facebook.com/messages/*`: read the newest inbound message,
  insert text into the composer.
- `popup.html`: paste pairing token, pick which listing this thread is for, auto-send toggle.
- `background.js`: calls `/api/extension/reply`.
- Draft insert only unless auto-send is on. Never log in as the user, never touch credentials,
  never scrape anything but the open thread.

Assume the Facebook DOM will break. Keep selectors in one file with a comment saying so, and
make the mock page the thing CI and the demo rely on.

### 5. PayPal invoice path
- `lib/paypalInvoice.ts`: create + send an invoice for `Negotiation.agreedCents`. Same rule as
  Orders: **the amount comes from the DB, never from the LLM or the client.**
- The agent asks for the buyer's email in chat when the channel is not `WEB`.
- Webhook: `INVOICING.INVOICE.PAID` marks PAID and the listing SOLD, reusing the existing
  verify-then-mark logic. Keep it idempotent.
- Confirm Invoicing is enabled on the sandbox account **before** building on it.

### 6. Email notification
Resend, on deal agreed and on paid. Needs `RESEND_API_KEY` in env. One plain-text template;
no campaign tooling.

### 7. Stretch: Pay Later
Pay Later buttons render through the JS SDK already used in `components/Checkout.tsx`, so the
hosted-checkout path is the cheap place to add it. Availability for CAD and in sandbox is
**unverified** — check before it goes in the video or the Devpost copy.

## Rules that still bind

- The LLM never sees floor or auto-accept, and never writes a digit. Placeholders only.
- Every price comes from `lib/policy.ts`.
- Payment amounts come from `Negotiation.agreedCents`, server-side.
- Do not claim escrow or "safe for both sides".
- The extension never sends a message the seller did not approve, unless the seller turned on
  auto-send themselves.

## Open questions

- Is Invoicing enabled on our PayPal sandbox account?
- Pay Later availability for CAD / sandbox.
- Craigslist and Kijiji terms on automated replies, if we extend past Facebook.
