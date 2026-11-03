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
- [ ] Get the stack running (see README "Run it"); `npm test` must be green.
- [ ] Run the live seller agent on `/l/road-bike` with a real `ANTHROPIC_API_KEY`; confirm tool calls fire and `{price}` is substituted.
- [ ] Run `npx vitest run tests/jailbreak.test.ts`: needs **15/15 on 3 consecutive runs**. Save logs to `docs/jailbreak-logs/`. Add more attacks if you find gaps.
- [ ] **Close the approval-vs-counter leak** (SCOPE.md section 2, first bullet): the `PENDING` reply ("let me check with the seller") is distinguishable from a counter. Idea: sometimes route a COUNTER through the same wording, or answer both with the same shape. Add a floor-probe test (a scripted buyer binary-searching offers) that proves the probe cannot narrow the floor.
- [ ] Add a concurrency test: parallel offers on one negotiation never double-increment `round` or double-agree (needs a DB).
- [ ] Tune the buyer agent prompt so the live demo looks good (starts low, climbs, stops at budget).
- [ ] P2: expose negotiation as an MCP server.

## Definition of done
Jailbreak suite passes 3x, floor-probe test passes, two agents negotiate live on the hosted URL.

## Gotchas
- AI SDK is v7 here (`inputSchema`, `stopWhen: stepCountIs(n)`). Check the installed `ai` types, not older tutorials.
- Model ids default to `claude-haiku-5-5`; override with `AI_MODEL`.
