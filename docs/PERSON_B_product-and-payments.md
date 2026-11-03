# Person B: Product and payments

Owns: PayPal integration, checkout, seller dashboard, deploy. Milestones M1 spike, M4, M5, M7. Full design: [SCOPE.md](../SCOPE.md) sections 4, 8, 13.

## Rule you must never break
The PayPal order amount is set **server-side from `Negotiation.agreedCents`**, never from the client or the LLM, and capture is verified (status, amount, currency) before anything is marked PAID.

## Already built (read these first)
| File | What it does |
|---|---|
| `lib/paypal.ts` | OAuth token, `createOrder` (with `PayPal-Request-Id`), `captureOrder`, pure `verifyCapture` (unit tested). |
| `scripts/paypal-spike.ts` | M1 spike: `npm run paypal:spike`, approve as sandbox buyer, `npm run paypal:spike -- <orderId>`. |
| `app/api/negotiations/[id]/paypal/{order,capture}/route.ts` | Idempotent order create; capture + verify + mark PAID + listing SOLD. |
| `components/Checkout.tsx` | `PayPalButtons`; used in the buyer chat and `/pay/[id]`. |
| `app/dashboard/page.tsx` | AG Grid, approvals panel, transcript + audit log, polls every 3s. |
| `lib/auth.ts` | Shared-password cookie for `/dashboard` and `/api/seller/*`. |
| `render.yaml` | Render blueprint (web service + Postgres). |

## Your task list
- [ ] **M1 today:** create the PayPal sandbox app, fill `.env`, run the spike end to end until it prints `{"ok":true,...}` with `COMPLETED`.
- [ ] Stand up Postgres (Docker or Neon/Render), `npx prisma db push`, `npm run seed`.
- [ ] **Deploy a hello-world + Postgres to Render on day 1** (see `render.yaml`) so hosting problems show up early. Use an always-on instance or a keep-warm ping.
- [ ] Test the full checkout in the sandbox: agree a deal on `/l/road-bike`, pay with the sandbox buyer, confirm status becomes PAID and the listing SOLD. Test cancel and retry.
- [ ] Put the **sandbox buyer login** in the README (sandbox credentials only).
- [ ] Dashboard: confirm approval flow end to end (price approve/deny, custom `ask_seller` reply), audit log view, status pills.
- [ ] PayPal webhook `POST /api/paypal/webhook` for `PAYMENT.CAPTURE.COMPLETED` (verify signature, idempotent). Needs `PAYPAL_WEBHOOK_ID`.
- [ ] **Agent Toolkit, read-only panel on the dashboard** (`get_order`, `list_transactions` via `@paypal/agent-toolkit`, sandbox). This keeps the "Best Use of PayPal + AI" claim true even if the full copilot is cut.
- [ ] P1: seller copilot with confirm-before-refund, take-over button.
- [ ] Spend cap on the LLM provider before the URL goes public.

## Definition of done
Hosted URL: negotiate, pay in the sandbox, dashboard updates to PAID, audit log shows the PayPal events.

## Gotchas
- `@/` import alias did not resolve in webpack here, so imports are relative. Keep them relative.
- Reservation: reaching AGREED reserves the listing for `RESERVATION_MINUTES`; `sweep()` releases it. Do not mark SOLD anywhere except the verified capture.
