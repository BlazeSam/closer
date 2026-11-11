# Closer — handoff

Last updated 2026-11-11. Hackathon ("Build What's Next with PayPal and AI") closes
**Thursday 12 Nov 2026, 12:00 pm Pacific**.

Read this first, then `docs/PLAN_EXTENSION.md` for the step-by-step design history and `SCOPE.md`
for the original product shape.

---

## 0. Resume here (11 Nov)

Live at **https://closer-9a91.onrender.com** (Render, auto-deploys from `main`, takes about 3 minutes).
Everything is committed and pushed; the working tree is clean apart from an untracked `.claude/`.

**Done 11 Nov (extension + clarity pass):**

- Landing page opens with two doors, "I'm selling" and "I'm buying" (3 steps, one main button each). The
  buyer door points at the existing chat and `/agent-buyer`. Dashboard starts with a 3-step guide.
- Extension pairs in one click: dashboard "Connect this browser" → `extension/pair.js` (content script on
  `/dashboard*` only, same-origin `postMessage`). Popup lists the seller's items from the new
  `POST /api/extension/listings` (token in body) instead of asking for a slug. Token and URL sit under Advanced.
- **Verified in the owner's real Chrome:** one-click connect, then a draft reply in the message box on the
  deployed `/demo/marketplace` with badge "draft ready".
- Facebook selectors rewritten from a live Messenger Marketplace thread (`[role=log] [data-message-id]
  [aria-roledescription=message]`, `At <time>, You:` label). Own messages read as outbound correctly.
  **Not verified:** a draft against a real buyer. The owner's test thread ("Samuel · Test Item") has the
  owner's account as the buyer. Needs the seller account in Chrome with the buyer having written last.
- Kijiji: `id()` no longer uses `data-testid`. Real DOM never inspected; selectors still guesses.
- Demo items relisted after testing (`/api/demo/reset`, 11 Nov).
- **Facebook, seller side, 11 Nov:** on a real Messenger Marketplace thread the extension read every buyer
  message correctly and drafted replies into the box (the owner sent them). Bugs found and fixed: draft inserted
  twice (31ca777); first counter equal to the asking price; a typo offer ("1150" for 150) accepted; "checkout
  below" with no checkout off the web (378e486); badge now names the item (74734b9). The fixed build has not been
  re-run on Facebook yet. That thread's negotiation for `film-camera` is AGREED, so retest by choosing a
  different item in the popup (a thread + item pair keeps its negotiation).
- Three leftover "Laptop" test listings show in the dashboard and popup. Not deleted (needs the owner's OK).

**Done 11 Nov (afternoon, power-user pass):**

- **Add to Closer** (f0a00a8): `extension/listing.js` + `CLOSER_FB_LISTING` in `selectors.js`. On
  `facebook.com/marketplace/item/<id>/` a fixed "Add to Closer" button reads title, price, description, condition and
  first photo (Open Graph tags first, DOM fallback; read-only) and opens `/sell/new?from=facebook&...` pre-filled. The
  seller sets the private prices and saves. Manifest 0.2.0 adds `facebook.com/marketplace/*` (content script runs
  `selectors.js` + `listing.js` only, never the reply drafter). Prefill checked locally. **Selectors not yet checked on
  a live listing page.** Kijiji listing pages not supported (skipped: Kijiji DOM never inspected).
- **Photo + questions** (d7ca91c): `/sell/new` is photo → check details → "a few quick questions" (condition, what the
  photo misses, lowest price, yes-at-once price, pickup/shipping). The draft's price guesses are shown as hints, not
  pre-filled. Plain-words check of floor ≤ auto-accept ≤ asking before the server's. Checked locally (prefill +
  validation message); a real save and a real photo draft were not run (would write to the live DB / spend tokens).
- **Sales analytics** (7b194fd, 735f96c): `GET /api/seller/analytics` (seller-gated) + pure `lib/analytics.ts` +
  panel at the top of `/dashboard`. Time to a deal = first message → ACCEPT/approved audit event (falls back to
  `updatedAt`). EXPIRED agreements don't count as sales. Offers above asking are ignored as typos. Checked locally
  against the live data.

**Next:** seller-side Facebook test, then Kijiji (open a conversation on an ad you posted, buyer wrote last,
read DOM only, fix `CLOSER_KIJIJI`). After any extension edit the owner presses reload in `chrome://extensions`
and reloads the page.

**Still needs the owner (nobody else can do these):**

1. Fill the four `TODO(you)` values in `README.md` and the matching slots in `docs/DEVPOST.md`.
2. Register the PayPal webhook and set `PAYPAL_WEBHOOK_ID` on Render, then send and pay one sandbox
   invoice from the dashboard button.
3. Make one sandbox payment through the live chat.
4. Record the video and submit on Devpost. Copy and video outline are in `docs/DEVPOST.md`.
5. Set an Anthropic spend limit.

**How to work here without breaking things:**

- Never run `npm test` blind: 13 tests write to and delete from the live Neon database. The safe set is
  `npx vitest run tests/guard.test.ts tests/policy.test.ts tests/trace.test.ts tests/invoice.test.ts tests/floorprobe.test.ts tests/listingDraft.test.ts tests/extension-content.test.ts`.
- To see the dashboard locally without the real password, start the `closer-dev-testpw` config in
  `.claude/launch.json` (it overrides `SELLER_PASSWORD` with a throwaway value for that process).
- Any test that reaches a deal really reserves the item. Relist with
  `curl -X POST https://closer-9a91.onrender.com/api/demo/reset`.
- Commit and push in small steps; the owner asked for that.

---

## 1. What Closer is

An AI sales agent for second-hand sellers. The seller sets a public asking price and a **secret
minimum**. Buyers — or buyers' own AI agents — haggle with Closer. When a deal is agreed, PayPal
settles it.

The one sentence that explains the architecture: **the AI talks, the code decides.**

- The model never sees `floorCents` or `autoAcceptCents`.
- The model never writes a digit. It emits `{price}` / `{ask}` / `{offer}` placeholders, and the
  server substitutes amounts that came from `lib/policy.ts`.
- `lib/guard.ts` is a backstop: it rejects any amount the system did not itself issue.
- Payment amounts come from `Negotiation.agreedCents`, server-side. Never from the chat, never
  from the client.

## 2. Run it

```bash
cp .env.example .env
```

```bash
npx prisma db push
```

```bash
npm run seed
```

```bash
npm run dev
```

Dev server is pinned to **http://localhost:3100**.

> **Port 3000 is a different project on this machine (CalenDue).** Do not use it, do not kill it,
> and never run a blanket `taskkill node.exe`. `APP_URL` in `.env` must say 3100 — it pointed at
> 3000 once and the agent-to-agent API advertised the wrong app.

```bash
npm test
```

81 tests. As of 10 Nov only the 68 that do not touch the database were re-run (all pass); the rest
last passed at `ef290f3`. Typecheck clean.

## 3. Current state

### Works, and has been run for real

- **Negotiation** — `/l/[slug]`. Policy-driven concession ladder, shadow approvals, jailbreak-hardened.
- **Jailbreak suite** — `tests/jailbreak.test.ts`, 15/15 on three consecutive runs with a live key.
  Logs in `docs/jailbreak-logs/`.
- **Photo to listing** — `/sell/new`. Vision reads the image and prices conservatively.
- **Agent vs agent** — now the **landing page** (`components/AgentDuel.tsx`). One button, two agents
  converge live. Verified in a browser: settled at CA$261 against a CA$270 budget.
- **PayPal Orders v2** — hosted checkout, capture verified for status, amount and currency.
- **PayPal Invoicing v2** — the buyer pays on paypal.com. Proved end to end on the sandbox: invoice
  created and sent, payment recorded, verified, negotiation `PAID`, listing `SOLD`, replay a no-op.
- **Webhook** — `POST /api/paypal/webhook`. Verifies PayPal's signature **before** reading the body,
  then re-fetches the invoice from PayPal rather than trusting the event's amount. Forged and
  unsigned webhooks were both confirmed rejected.
- **Demo reset** — `POST /api/demo/reset`. Allowlisted to three seeded slugs, can only ever relist.
  Intentionally unauthenticated: a judge has no login.

### Built but never run once

- **The Chrome extension.** `extension/` is an MV3 extension (content script, service worker, popup)
  with a demo marketplace at `/demo/marketplace`. It has **never been loaded in a real browser.**
  The Facebook Marketplace selectors are unverified guesses and should be expected to miss.

### Not built

- Email notifications (Resend). Cut: PayPal already emails the buyer the invoice.
- MCP server. Worthless until deployed — a stdio server means every judge has to clone the repo.

### Added 10 Nov (deployed at https://closer-9a91.onrender.com, Render, auto-deploys from `main`)

- **Paste mode** — dashboard, "Reply to a buyer on another site" (`POST /api/seller/reply`). Run in a
  browser locally through to an agreed deal and a payment link.
- **Invoice button** — select an AGREED row in the dashboard. The form renders; a real invoice was
  **not** sent from the button (the route itself was proven earlier).
- **AG Grid dashboard** — filters, status chips, summary row, CSV export. Checked in a browser.
- **Extension** — Render origin and Kijiji added. Still never loaded in real Chrome.
- **Fixed on the live site:** buyer chat crashed on the first reply (Chrome returns a Promise from
  `scrollIntoView`); the landing duel failed with "fetch failed" (server could not reach itself
  behind Render's proxy); payment links pointed at `closer.onrender.com` (wrong `APP_URL`; the app
  now prefers `RENDER_EXTERNAL_URL`); bare-number offers ("take 100?") lost the model's reply and
  burned rounds; an offer plus a question in one message closed the chat.
- The landing page now lists only the three demo slugs (`DEMO_SLUGS` in `lib/publicListing.ts`).

Hackathon facts (from the Devpost rules): deadline **Thu 12 Nov, 12:00 pm Pacific**. The demo must
stay up, free, until judging ends **15 Dec**. One Grand or Honorable Mention prize plus one Sponsor
prize per project. The video may not show third-party trademarks, so film `/demo/marketplace`.

## 4. What is left, in order

1. **Fill the four `TODO(you)` values** in `README.md` (and the matching slots in
   `docs/DEVPOST.md`): YouTube link, demo seller password, PayPal sandbox buyer email and password.
2. **Set `PAYPAL_WEBHOOK_ID` on Render** if not done. Register `<site>/api/paypal/webhook` for
   `INVOICING.INVOICE.PAID`. Until it is set the route returns **503** and invoice payments are not
   recorded. Then send one real sandbox invoice from the dashboard button and pay it.
3. **Load the extension in real Chrome.** `chrome://extensions` → Developer mode → Load unpacked →
   `extension/`. Try `/demo/marketplace` on the deployed site first, then a real chat, and fix
   `extension/selectors.js` against the real page.
4. **Do one real sale with paste mode** and write down the numbers. The "Potential Impact"
   criterion wants evidence, not features.
5. **Demo video + Devpost submission.** Copy is in `docs/DEVPOST.md`.
6. Set an Anthropic spend limit. The public demo calls the model for every visitor until 15 Dec.

## 5. Security invariants — do not break these

- `GET /api/negotiations/[id]/trace` is **seller-only**. The raw audit log contains the
  floor-revealing decision branch. The buyer-facing trace goes through a strict whitelist in
  `lib/trace.ts`. **Do not widen that route.**
- The extension must **never** handle the seller's password and must never log in as the user.
  Token only, and the token goes in a POST body — **never** in a URL or query string.
- The buyer's email for an invoice is typed by the **seller**, never collected in chat. A
  buyer-supplied address would let someone redirect another person's invoice.
- Do not claim to be a Facebook integration or partner anywhere in the UI or README.
- Do not claim escrow, or that the flow is "safe for both sides".
- `.env` is gitignored and must stay so.

## 6. Gotchas that cost real time

- **Tests write to, and `deleteMany` from, the live Neon database.** There is no separate test DB.
- `npm run build` fails with `EPERM` on `query_engine-windows.dll.node` while the dev server holds
  the DLL. Stop the dev server, build, restart.
- Imports in this repo are **relative**, not aliased.
- Bash `/tmp` is not node's `/tmp` on this machine.
- Heredocs containing backticks or `${}` break here. Write the patch script to a file and run it
  by absolute path instead.
- PayPal's create-invoice returns **only a self link**, not the invoice object. The id has to be
  parsed out of the href (`invoiceIdFromHref` in `lib/paypal.ts`), or you end up requesting
  `/v2/invoicing/invoices/undefined/send`.
- A negotiation that reaches a deal really does sell the item, so any repeatable demo has to relist
  first. That is what `/api/demo/reset` is for.

## 7. Known rough edges

- Three junk `laptop-*` listings from earlier testing are still in the live database and render on
  the landing page. Clear them before recording:

```bash
npx tsx -e "import('./lib/db.ts').then(async({prisma})=>{console.log(await prisma.listing.deleteMany({where:{slug:{startsWith:'laptop-'}}}));await prisma.\$disconnect()})"
```

- `README.md` still says port 3000 and still carries a "DB-backed flows were not yet run" caveat
  that is no longer true. Rewrite it before submitting.
- Rate limiting is in-memory, so it is per-instance only.
- Auth is one shared seller password. Real accounts were always out of scope.
- An approval-needed offer still reads slightly differently from an ordinary counter. Jitter and
  latency reduce floor-probing but do not eliminate it.

## 8. Map of the code

| Path | What |
|---|---|
| `lib/policy.ts` | Pure, tested price policy. Nothing ever decides below the floor (1000-case property test). |
| `lib/sellerAgent.ts` | The seller agent: prompt, tools, reply guard, audit events. |
| `lib/buyerAgent.ts` | The buyer agent, with a budget enforced in code. |
| `lib/negotiation.ts` | Turn handling, state transitions, shared `markPaid`. |
| `lib/guard.ts` | Rejects amounts the system did not issue. |
| `lib/replies.ts` | Placeholder substitution (`{price}`, `{ask}`, `{offer}`). |
| `lib/paypal.ts` | Orders v2, Invoicing v2, capture/invoice verification, webhook signature check. |
| `lib/trace.ts` | Whitelist redaction for the buyer-facing audit trace. |
| `components/AgentDuel.tsx` | The landing-page duel. |
| `extension/` | MV3 Chrome extension. Never loaded in a real browser. |
| `tests/` | 79 tests. `jailbreak.test.ts` needs a live key. |
