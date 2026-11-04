# Closer: session handoff

Paste into new session: "Read HANDOFF.md and SCOPE.md, then continue."

## What it is
AI sales agent for second-hand sellers. Devpost hackathon "Build What's Next with PayPal and AI", due Nov 12 2026 (target Nov 11). Design: `SCOPE.md`. Repo: https://github.com/BlazeSam/closer (owner BlazeSam). Team of 3, task docs in `docs/PERSON_{A,B,C}_*.md`.

## Core rule
AI talks, code decides. LLM never sees floor/auto-accept, never writes digits (uses `{price}`/`{ask}` placeholders). All price logic in `lib/policy.ts`. PayPal amount comes from DB `agreedCents`; capture verified by `verifyCapture`. Output guard `lib/guard.ts` is backstop.

## Stack
Next.js 15.5 App Router, TS 5 (NOT 7), Tailwind v4, Prisma 6 + Neon Postgres, Vercel AI SDK v7 (default model `claude-haiku-5-5`, override `AI_MODEL`), PayPal Orders v2 + `@paypal/react-paypal-js`, AG Grid Community, Vitest.

## Windows gotchas
- Imports must be RELATIVE (`@/` alias fails in webpack).
- bash `/tmp` != node `/tmp`. Do multi-step scripts inside one node script.
- Heredocs flaky in bash tool; use Write tool.
- Git push uses repo-local helper `!gh auth git-credential` (BlazeSam). Global cached cred is another account; don't touch.

## State (all pushed, HEAD 06e6e57, tree clean)
Verified end to end on real Neon + PayPal sandbox: negotiate via agent API, seller approve, order, buyer pay, capture, negotiation PAID, listing SOLD (captureId 44U25789H41433727). No floor/auto leak in responses. 26 tests pass, 1 skipped (jailbreak suite).
- `.env` has `CURRENCY=CAD` (prices show "CA$"). Works; keep unless wanting USD (then reseed).
- road-bike listing is now SOLD. Reseed to reactivate: `npm run seed`.
- Dev server: `CLOSER_NO_DELAY=1 npx next dev -p 3000` (may still be running; port 3000).
- Spike order 1JL713278S045893V (USD 20) uncaptured; ignore.
- `reviveForCheckout` in `lib/negotiation.ts` revives EXPIRED deals at checkout if listing still free (called in order + capture routes).

## Done so far
**Design**
- Read `SCOPE.md`, listed improvements, patched it: no behavioral floor leak (random 0.5-2s delay, counter jitter, 5 new negotiations per IP per listing per hour), LLM emits no digits, `ListingPrivate` table, softer pitch (no "escrow" / "safe for both sides"), dashboard password, read-only Agent Toolkit panel, reservation + approval TTL, webhook, spend caps, new test bars.

**Core logic (all unit tested)**
- `lib/policy.ts`: ACCEPT / NEEDS_APPROVAL / COUNTER / FINAL_OFFER / REJECT_INVALID. 11 tests incl. 1000-case seeded property test (never below floor).
- `lib/guard.ts`: `extractAmounts` (`$200`, `200 bucks`, `$2k`, spelled-out, fullwidth digits) + `replyIsClean` + safe template.
- `lib/paypal.ts`: token, `createOrder` (idempotent via `PayPal-Request-Id`), `captureOrder`, pure `verifyCapture`.
- `lib/negotiation.ts`: state machine, `version` optimistic concurrency, listing reservation, `sweep()` expiry, `resolveApproval`, `reviveForCheckout`.
- `lib/sellerAgent.ts`: LLM path (tools `evaluate_offer`, `get_listing_info`, `ask_seller`, guard with one regenerate) + deterministic fallback with no API key.
- `lib/buyerAgent.ts`: budget clamped in code, talks only via public agent API, streams NDJSON.
- Also `lib/{db,env,auth,ratelimit,replies,publicListing,turnRoute}.ts`.

**API routes**
- Human chat, agent API (`/api/agent/listings/[slug]`, `/negotiate`, poll `/api/agent/negotiations/[id]`), buyer poll, PayPal `order` + `capture`, seller `login/listings/dashboard/negotiations/approvals`, `/api/agent-buyer/run`.

**UI**
- `/` landing, `/l/[slug]` chat + checkout, `/pay/[id]`, `/sell/new`, `/dashboard` (AG Grid, approvals, transcript, audit), `/agent-buyer`.

**Infra / repo**
- Prisma schema + seed (road-bike, standing-desk, film-camera), Neon connected, `render.yaml`, `docker-compose.yml`, `.env.example`, README, MIT LICENSE, jailbreak suite (skipped without key).
- Team docs: `docs/PERSON_A/B/C_*.md`.
- 12+ incremental commits pushed to `main`.

**Bugs fixed along the way**
- Prisma enums on one line; `@/` alias -> relative imports; Next rejected TS 7 -> pinned TS 5; push 403 -> repo-local `gh` credential helper; placeholder DB password; deal expiring before capture -> `reviveForCheckout`.

**Live verification (Neon + PayPal sandbox)**
- Lowball -> counters CA$220, 203, 192. CA$180 offer -> AWAITING_APPROVAL -> seller approved -> AGREED -> PayPal order CA$180.00 -> buyer approved -> captured -> PAID, listing SOLD. No floor/auto value in any response.

## Not done yet
1. `ANTHROPIC_API_KEY` missing in `.env`. Add it, then `npx vitest run tests/jailbreak.test.ts` (need 15/15, three runs). LLM path is untested live.
2. Browser UI never walked through: `/l/film-camera`, `/dashboard`, `/sell/new`, `/agent-buyer`, `/pay/[id]`.
3. Leak: NEEDS_APPROVAL reply ("let me check with the seller") reads differently from counters, so buyer can infer floor <= offer < auto. Make timing/wording indistinguishable + add floor-probe test.
4. PayPal webhook `POST /api/paypal/webhook` (`PAYMENT.CAPTURE.COMPLETED`, verify signature, idempotent, needs `PAYPAL_WEBHOOK_ID`).
5. Read-only Agent Toolkit dashboard panel (`get_order`, `list_transactions`, sandbox). Keeps "Best Use of PayPal + AI" claim true.
6. Deploy to Render (`render.yaml`). Set LLM provider spend cap before public URL.
7. P1: seller copilot, take-over button, photo-to-listing, MCP server.
8. In-memory rate limiter is single instance only.
9. Optional: Dockerfile + compose app service (user asked about resume value).
10. Teammates: add GitHub collaborators, share `docs/PERSON_*.md`.

## Key files
- `lib/policy.ts` deterministic decisions (counter = floor + gap*prod(1-0.35±0.03 jitter), ceil to dollar, clamp)
- `lib/negotiation.ts` state machine, optimistic concurrency via `version`, reservation, `sweep()`
- `lib/sellerAgent.ts`, `lib/buyerAgent.ts`, `lib/replies.ts`, `lib/guard.ts`, `lib/paypal.ts`
- `app/api/**` routes, `components/{Chat,Checkout,SellerGate}.tsx`, `app/dashboard/page.tsx`
- `scripts/paypal-spike.ts`, `tests/*`, `prisma/{schema,seed}`

## Full old transcript
`C:\Users\axeba\.claude\projects\C--Users-axeba-OneDrive-Desktop-closer\e54432d8-0380-44c5-af98-7de9fdb18b12.jsonl`
