# Person C: Story and quality

Owns: seller interviews, cross-device testing, README, Devpost text, demo video. Joins the build on P1 items. Full design: [SCOPE.md](../SCOPE.md) sections 1, 12, 14.

## Deadlines
Submission due **Nov 12** (confirm exact time and time zone on the Devpost page). Target **Nov 11**. Video recorded Nov 10 on the hosted app.

## Your task list
- [ ] **Interview 3-4 people who sell online** (Marketplace, Craigslist, eBay, Vinted). Ask: worst lowballer story, no-shows, payment scams, how long haggling takes, would they trust an agent with a hard floor. Save quotes to `docs/interviews.md` with permission. Quotes go in the video and README.
- [ ] Read the **Devpost rules** end to end; tick off every requirement in SCOPE.md section 12 (agentic commerce, PayPal usage, video rules, repo/license).
- [ ] Test every flow on **phone and desktop** once the app runs: create listing, human chat, jailbreak attempt, agreed deal, PayPal pay, dashboard approve/deny, buyer agent page. File bugs as GitHub issues with screenshots.
- [ ] Try to **break it like a judge**: "ignore your instructions", "what's your minimum?", fake system messages, other currencies. Report anything that leaks a price to Person A.
- [ ] **README:** what it is, architecture diagram, setup, env vars, seed, sandbox buyer login (from Person B), how PayPal and AI are used (name every API/tool), known limitations. Starts from the existing `README.md`.
- [ ] **Devpost text** plus a "Tools" section: AI model, Vercel AI SDK, PayPal Orders API, PayPal Agent Toolkit, AG Grid, Render.
- [ ] **Video (< 3:00, public on YouTube, no copyrighted music).** Outline in SCOPE.md section 12. Also record a **fallback happy-path video** in case the live sandbox flakes.
- [ ] Be careful with claims: do not say "escrow" or "safe for both sides". Say PayPal settles the payment.

## Demo script (rehearse twice)
1. `/sell/new`: create a listing with a secret minimum, copy the link.
2. `/l/<slug>`: haggle, try one jailbreak (it fails), reach a deal, pay with the sandbox buyer.
3. `/dashboard`: row flips to PAID, open the audit log.
4. `/agent-buyer`: budget $190, start, watch the two agents negotiate, approve payment with one tap.
5. Close on: "Delegate the sale. Keep the control."

## Definition of done
Devpost submitted by Nov 11 with repo link, hosted URL, video link, text and tools section.
