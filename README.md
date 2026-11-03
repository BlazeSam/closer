# Closer

An AI sales agent for second-hand sellers. Set an asking price and a secret minimum, share a link, and let buyers (or their AI agents) haggle with Closer. When a deal is agreed, PayPal settles it in the chat. **The AI talks, the code decides.** Full design in [SCOPE.md](SCOPE.md).

## Run it

```bash
cp .env.example .env        # fill in PayPal sandbox + (optional) Anthropic key + SELLER_PASSWORD
docker compose up -d        # Postgres (or point DATABASE_URL at any Postgres)
npx prisma db push
npm run seed                # demo seller + 3 listings
npm run dev                 # http://localhost:3000
npm test                    # policy, guard, capture-verification unit tests
```

Without an LLM key the seller and buyer agents fall back to deterministic templates, so the whole flow (negotiate, approve, pay) still works.

PayPal spike (M1): `npm run paypal:spike` prints a sandbox approval URL; approve as the sandbox buyer, then `npm run paypal:spike -- <orderId>` captures and verifies it.

## Pages

| Path | What |
|---|---|
| `/l/[slug]` | Buyer chat + PayPal checkout |
| `/sell/new`, `/dashboard` | Seller (shared-password gated): create listing, AG Grid negotiations, approvals, transcript + audit log |
| `/agent-buyer` | Buyer agent with a code-enforced budget negotiates over the public agent API |
| `/pay/[id]` | One-tap PayPal approval for an agent's agreed deal |
| `GET /api/agent/listings/[slug]`, `POST .../negotiate`, `GET /api/agent/negotiations/[id]` | Agent-to-agent API |

## How safety works

- `lib/policy.ts`: pure, tested price policy. No decision is ever below the floor (1000-case property test).
- The LLM never sees the floor or auto-accept price (`ListingPrivate` is only read by the policy and seller routes) and writes `{price}` placeholders instead of digits. `lib/guard.ts` is a backstop that rejects any amount the system didn't issue.
- PayPal order amount comes from the DB (`agreedCents`); capture is verified for status, amount and currency (`verifyCapture`).
- Optimistic concurrency (`Negotiation.version`), a listing reservation on agreement, and approval/agreement TTLs prevent races and double sales.

## Known limitations

- DB-backed flows were type-checked and built but not yet run against a live Postgres/PayPal sandbox in this repo's first pass; run the checklist below.
- An approval-needed offer still reads differently from a counter ("let me check with the seller"). Random latency and per-negotiation counter jitter reduce, but do not eliminate, floor probing.
- Rate limiting is in-memory (single instance).
- Auth is one shared seller password (out of scope: real accounts).

## Sandbox checklist

1. Create a PayPal sandbox app; set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`.
2. `npm run paypal:spike` end to end.
3. Negotiate `/l/road-bike`, accept, pay with the sandbox buyer login (add it here).
4. `npx vitest run tests/jailbreak.test.ts` with a real key (15/15, three runs).

MIT licensed.
