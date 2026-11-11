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
- [x] **M1 today:** create the PayPal sandbox app, fill `.env`, run the spike end to end until it prints `{"ok":true,...}` with `COMPLETED`.
- [x] Stand up Postgres (done on Neon; Docker or Render also work), `npx prisma db push`, `npm run seed`.
- [x] **Deploy a hello-world + Postgres to Render on day 1** (see `render.yaml`) so hosting problems show up early. Use an always-on instance or a keep-warm ping.
- [x] Test the full checkout in the sandbox: agree a deal on `/l/road-bike`, pay with the sandbox buyer, confirm status becomes PAID and the listing SOLD. Test cancel and retry.
- [ ] Put the **sandbox buyer login** in the README (sandbox credentials only). README has the slots, still `TODO(you)`.
- [x] Dashboard: confirm approval flow end to end (price approve/deny, custom `ask_seller` reply), audit log view, status pills.
- [x] PayPal webhook `POST /api/paypal/webhook` for `PAYMENT.CAPTURE.COMPLETED` (verify signature, idempotent). Needs `PAYPAL_WEBHOOK_ID`.
- [ ] **Agent Toolkit, read-only panel (not built; `@paypal/agent-toolkit` not installed, Devpost draft already says no Toolkit claim) on the dashboard** (`get_order`, `list_transactions` via `@paypal/agent-toolkit`, sandbox). This keeps the "Best Use of PayPal + AI" claim true even if the full copilot is cut.
- [x] **Confirm PayPal Invoicing is enabled on the sandbox account** before anyone builds on it.
- [x] `lib/paypalInvoice.ts` (lives in `lib/paypal.ts` + `/paypal/invoice` route): create + send an invoice for `Negotiation.agreedCents` (amount from the DB, never the client). Webhook `INVOICING.INVOICE.PAID` marks PAID + SOLD, idempotent, reusing the verify-then-mark logic.
- [x] `SellerToken` table (sha256 hash stored, plaintext shown once, revocable) + `POST /api/seller/tokens` to mint. Extension pairing never sees `SELLER_PASSWORD`. **Dashboard mint button is done; revoke UI/route still missing.**
- [x] `POST /api/extension/reply` ({token, channel, threadId, listingSlug, buyerMessage}) -> same `handleTurn`. Token-scoped: rejects bad/revoked tokens and listings owned by another seller. Rate limited 120/min per token. Tests in `tests/extension.test.ts`.
- [ ] (cut, PayPal emails the invoice) Deal-agreed and paid emails via Resend (`RESEND_API_KEY`). Plain text, no campaign tooling.
- [ ] Stretch, after everything: PayPal Pay Later buttons on the hosted checkout. Verify CAD/sandbox availability before it goes in the video.
- [ ] P1: seller copilot with confirm-before-refund, take-over button.
- [ ] Spend cap on the LLM provider before the URL goes public.

## Definition of done
Hosted URL: negotiate, pay in the sandbox, dashboard updates to PAID, audit log shows the PayPal events.

## Gotchas
- `@/` import alias did not resolve in webpack here, so imports are relative. Keep them relative.
- Reservation: reaching AGREED reserves the listing for `RESERVATION_MINUTES`; `sweep()` releases it. Do not mark SOLD anywhere except the verified capture.
