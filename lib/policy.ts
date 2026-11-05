// Deterministic negotiation policy. The LLM never decides a price; this does.
export type PolicyListing = {
  askCents: number;
  floorCents: number;
  autoAcceptCents: number;
  currency: string;
};

export type PolicyState = {
  round: number; // buyer offers already evaluated in this negotiation
  lastCounterCents?: number | null;
  seed: string; // negotiation id; makes counter jitter stable per negotiation
};

export type Decision =
  | { type: "ACCEPT"; priceCents: number }
  | { type: "COUNTER"; priceCents: number }
  | { type: "NEEDS_APPROVAL"; priceCents: number; counterCents: number; final: boolean }
  | { type: "FINAL_OFFER"; priceCents: number }
  | { type: "REJECT_INVALID" };

export const DEFAULT_MAX_ROUNDS = 6;
const MOVE = 0.35; // share of remaining gap given up per round
const JITTER = 0.03; // +/- on MOVE, so the schedule isn't a fixed curve buyers can invert
const MAX_OFFER_MULTIPLE = 10; // offers beyond 10x ask are treated as typos/abuse

export function validateListing(l: PolicyListing): void {
  const ints = [l.askCents, l.floorCents, l.autoAcceptCents].every(Number.isInteger);
  if (!ints || !(0 < l.floorCents && l.floorCents <= l.autoAcceptCents && l.autoAcceptCents <= l.askCents)) {
    throw new Error("listing prices must satisfy 0 < floor <= autoAccept <= ask (integer cents)");
  }
}

function hash01(s: string): number {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

const ceilDollar = (c: number) => Math.ceil(c / 100) * 100;

// Counter for the given round: floor + gap * prod(1 - move_i). Rounded UP to whole
// dollars (so rounding can never undercut floor), clamped to [floor, previous counter, ask].
export function counterFor(l: PolicyListing, s: PolicyState): number {
  const gap = l.askCents - l.floorCents;
  let remaining = gap;
  for (let i = 0; i < s.round; i++) {
    const move = MOVE + (hash01(`${s.seed}:${i}`) * 2 - 1) * JITTER;
    remaining *= 1 - move;
  }
  let price = ceilDollar(l.floorCents + remaining);
  price = Math.min(price, s.lastCounterCents ?? l.askCents, l.askCents);
  return Math.max(price, l.floorCents);
}

export function evaluateOffer(
  l: PolicyListing,
  s: PolicyState,
  offerCents: number,
  opts: { maxRounds?: number; offerCurrency?: string } = {},
): Decision {
  validateListing(l);
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  if (
    !Number.isInteger(offerCents) ||
    offerCents <= 0 ||
    offerCents > l.askCents * MAX_OFFER_MULTIPLE ||
    (opts.offerCurrency && opts.offerCurrency.toUpperCase() !== l.currency.toUpperCase())
  ) {
    return { type: "REJECT_INVALID" };
  }

  // Never charge more than the ask, even if the buyer offers more.
  if (offerCents >= l.autoAcceptCents) return { type: "ACCEPT", priceCents: Math.min(offerCents, l.askCents) };
  if (s.lastCounterCents != null && offerCents >= s.lastCounterCents) {
    return { type: "ACCEPT", priceCents: s.lastCounterCents };
  }
  const counter = counterFor(l, s);
  // Mid-band: the buyer sees an ordinary counter (never below their own offer), and the seller is asked
  // silently. Otherwise "let me check with the seller" would reveal that floor <= offer < autoAccept.
  if (offerCents >= l.floorCents) {
    const shown = Math.min(Math.max(counter, ceilDollar(offerCents) + 100), s.lastCounterCents ?? l.askCents, l.askCents);
    return { type: "NEEDS_APPROVAL", priceCents: offerCents, counterCents: shown, final: s.round >= maxRounds };
  }
  if (s.round >= maxRounds) return { type: "FINAL_OFFER", priceCents: counter };
  return { type: "COUNTER", priceCents: counter };
}
