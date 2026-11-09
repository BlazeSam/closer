// Buyer-facing view of the audit log.
//
// The raw audit log holds two things a buyer must never learn:
//   1. WHICH policy branch ran. ACCEPT vs NEEDS_APPROVAL vs COUNTER reveals where their offer sits
//      against the hidden floor and auto-accept, which is the leak lib/policy.ts works to prevent.
//   2. The guard-blocked reply text, which is blocked precisely because it contained a price the
//      model should never have written.
//
// So this is a strict whitelist that rebuilds every entry from scratch. Raw payloads are never
// passed through, and an unknown event type is dropped rather than shown.
import { fmt } from "./replies";
export { INVARIANTS } from "./invariants";

export type TraceKind = "policy" | "guard" | "model" | "payment";
export type TraceEntry = { at: string; kind: TraceKind; label: string; detail?: string };
export type RawEvent = { type: string; payload: unknown; createdAt: Date | string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function redactForBuyer(events: RawEvent[], currency: string): TraceEntry[] {
  const out: TraceEntry[] = [];
  for (const e of events) {
    const at = new Date(e.createdAt).toISOString();
    const p = (e.payload ?? {}) as Record<string, unknown>;
    switch (e.type) {
      case "POLICY_DECISION": {
        // The offer is the buyer's own number, so echoing it tells them nothing new. The decision
        // branch and any counter are deliberately omitted.
        const offer = num(p.offerCents);
        const round = num(p.round);
        out.push({
          at,
          kind: "policy",
          label: "Offer evaluated by the pricing policy",
          detail: [offer !== undefined ? `offer ${fmt(offer, currency)}` : null, round !== undefined ? `round ${round + 1}` : null].filter(Boolean).join(" · ") || undefined,
        });
        break;
      }
      case "GUARD_TRIGGERED":
        out.push({
          at,
          kind: "guard",
          label: p.replaced === true ? "Model reply rejected twice; replaced with a policy-written reply" : "Model reply rejected by the output guard; regenerating",
          detail: "The guard blocks any amount the policy did not authorise.",
        });
        break;
      case "REPLY_CHECKED":
        out.push(
          p.source === "policy"
            ? { at, kind: "policy", label: "Reply written by the policy, not the model" }
            : { at, kind: "guard", label: "Model reply checked against the policy", detail: "No amount the policy had not authorised." },
        );
        break;
      case "LLM_FAILED":
        // The provider's error text can name the provider, the key state or internal URLs. Dropped.
        out.push({ at, kind: "model", label: "Model unavailable; the reply came from the policy instead", detail: "Negotiation continues without the model." });
        break;
      case "PAYPAL_ORDER_CREATED":
        out.push({ at, kind: "payment", label: "PayPal order created for the agreed price" });
        break;
      case "PAYPAL_CAPTURED":
        out.push({ at, kind: "payment", label: "Payment captured and verified against the agreed price" });
        break;
      case "PAYPAL_CAPTURE_MISMATCH":
        out.push({ at, kind: "payment", label: "Capture rejected: the captured amount did not match the agreed price" });
        break;
      default:
        break; // Unknown or seller-only (approvals, revivals) are never exposed to the buyer.
    }
  }
  return out;
}
