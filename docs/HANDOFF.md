# Closer — handoff

Last updated 2026-11-09. Hackathon ("Build What's Next with PayPal and AI") closes **Thursday 12 Nov 2026**.

Read this first, then `docs/PLAN_EXTENSION.md` for the step-by-step design history and `SCOPE.md`
for the original product shape.

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

79 tests, all passing as of `ef290f3`. Typecheck clean. `npm run build` passes.

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

## 4. What is left, in order

1. **Deploy.** Nothing else scores without a clickable URL. Needs a Vercel (or similar) account.
   Env vars to set: `DATABASE_URL`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
   `PAYPAL_ENVIRONMENT=sandbox`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `APP_URL` (the deployed origin),
   `ANTHROPIC_API_KEY`, `SELLER_PASSWORD`, `CURRENCY`.
2. **Set `PAYPAL_WEBHOOK_ID`.** Registering a webhook needs a public URL, so this can only happen
   after step 1. Until it is set the webhook route returns **503** rather than trusting an
   unverified event. Register the endpoint at `<APP_URL>/api/paypal/webhook` for
   `INVOICING.INVOICE.PAID`, copy the webhook id into env, then send a test event from the
   PayPal dashboard.
3. **Load the extension in real Chrome.** `chrome://extensions` → Developer mode → Load unpacked →
   `extension/`. Then open `/demo/marketplace` and fix whatever the selectors miss.
4. **Demo video + Devpost copy.** Lead with the landing-page duel. The PayPal-usage section of the
   submission is worth writing carefully: Orders v2 *and* Invoicing v2, signature-verified webhooks,
   idempotent capture.

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
