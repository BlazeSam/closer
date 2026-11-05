# Person A: Agents and policy

Owns: negotiation policy, seller agent, buyer agent, output guard, jailbreak suite. Milestones M2, M3, agent half of M6. Full design: [SCOPE.md](../SCOPE.md) sections 2, 6, 7, 11.

## Rule you must never break
The AI talks, the code decides. The LLM never sees `floorCents` / `autoAcceptCents`, never writes a digit for money (it writes `{price}` / `{ask}`), and every price comes from `lib/policy.ts` via `applyOffer()`.

## Already built (read these first)
| File | What it does |
|---|---|
| `lib/policy.ts` | Pure `evaluateOffer` + `counterFor`. 1000-case property test: never below floor. |
| `lib/negotiation.ts` | DB state machine: `applyOffer`, `resolveApproval`, `sweep`. Optimistic concurrency via `Negotiation.version`. |
| `lib/sellerAgent.ts` | `handleTurn`: LLM with tools `evaluate_offer`, `get_listing_info`, `ask_seller`; guard + regenerate-once; deterministic fallback with no API key. |
| `lib/guard.ts` | Finds every money amount in a reply (`$200`, `200 bucks`, `2k`, spelled-out, fullwidth digits). |
| `lib/buyerAgent.ts` | Buyer agent with budget clamped in code, talks only via the public agent API. |
| `tests/jailbreak.test.ts` | 15 adversarial messages, skipped unless DB + API key are set. |

## Your task list
- [x] Get the stack running; `npm test` green (32 tests pass, jailbreak suite excluded without a key).
- [ ] Run the live seller agent on `/l/road-bike` with a real `ANTHROPIC_API_KEY`; confirm tool calls fire and `{price}` is substituted.
- [ ] Run `npx vitest run tests/jailbreak.test.ts`: needs **15/15 on 3 consecutive runs**. Save logs to `docs/jailbreak-logs/`. Add more attacks if you find gaps.
- [x] **Close the approval-vs-counter leak.** Done differently from the idea here: a mid-band offer (floor <= offer < auto-accept) now returns an ordinary COUNTER/FINAL reply that is always above the buyer's offer, and the approval is a silent "shadow" approval (`details.shadow`). Negotiation stays OPEN. Seller approve => AGREED at the offer; deny/expire => nothing visible. Code: `lib/policy.ts` (`NEEDS_APPROVAL` carries `counterCents`), `lib/negotiation.ts` (`applyOffer`, `resolveApproval`). Floor-probe test: `tests/floorprobe.test.ts`.
- [x] Concurrency tests (`tests/concurrency.test.ts`, live DB, self-cleaning): parallel offers never double-count a round; racing negotiations on one listing yield exactly one AGREED; shadow approval agrees at the offer.
- [ ] Tune the buyer agent prompt so the live demo looks good (starts low, climbs, stops at budget).
- [ ] P2: expose negotiation as an MCP server.

## Still open (blocked on Anthropic API credits)
- Live seller agent check, jailbreak 15/15 x3 with logs, buyer prompt tuning. Last attempt failed with `credit balance is too low` (Claude Pro does not include API credits).
- Buyer agent: with shadow approvals the negotiation stays OPEN, so a late seller acceptance shows up as a message on the next turn/poll, not as AWAITING_APPROVAL.

## New direction (see [PLAN_EXTENSION.md](PLAN_EXTENSION.md))
- [x] Thread-aware negotiations: `channel` (WEB/FB_MARKETPLACE/KIJIJI/MOCK) + `externalThreadId` on `Negotiation`, `@@unique([listingId, externalThreadId])`, find-or-create in `startNegotiation(slug, buyerType, label, ip, thread?)`. P2002 race falls back to the winning row. Web paths untouched (NULLs are distinct in Postgres); the per-IP new-negotiation cap now applies to web only, since a thread cannot be reset by reopening it. Tests in `tests/concurrency.test.ts`.
- [ ] Agent asks for the buyer email when `channel != WEB`, so the invoice can be sent. Still no digits from the LLM.
- [ ] Re-run the jailbreak suite against the extension path once it exists; a pasted buyer message is still untrusted input.

## Definition of done
Jailbreak suite passes 3x, floor-probe test passes, two agents negotiate live on the hosted URL.

## Gotchas
- AI SDK is v7 here (`inputSchema`, `stopWhen: stepCountIs(n)`). Check the installed `ai` types, not older tutorials.
- Model ids default to `claude-haiku-5-5`; override with `AI_MODEL`.
