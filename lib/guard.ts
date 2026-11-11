// Output guard: backstop that finds every money amount in a reply so the caller can
// check it against the set of prices the system actually issued.
const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

// Spelled-out numbers up to the thousands: "two hundred fifty", "one thousand two hundred".
function wordsToNumber(text: string): number[] {
  const out: number[] = [];
  const toks = text.toLowerCase().replace(/-/g, " ").split(/[^a-z]+/).filter(Boolean);
  let total = 0;
  let cur = 0;
  let any = false;
  const flush = () => {
    if (any) out.push(total + cur);
    total = cur = 0;
    any = false;
  };
  for (const t of toks) {
    if (t in WORDS) {
      cur += WORDS[t];
      any = true;
    } else if (t === "hundred" && any) cur = (cur || 1) * 100;
    else if (t === "thousand" && any) {
      total += (cur || 1) * 1000;
      cur = 0;
    } else if (t !== "and") flush();
  }
  flush();
  return out.filter((n) => n >= 10);
}

// Returns every amount mentioned, in whole currency units (may be fractional).
export function extractAmounts(reply: string): number[] {
  // Normalise fullwidth digits (U+FF10-FF19) so a fullwidth "200" can't slip past the digit regexes.
  const text = reply.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10));
  const found: number[] = [];
  const num = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
  // $200, USD 200, 200 USD, 200 dollars/bucks, 2k / $2k
  const re = new RegExp(
    String.raw`(?:[$€£]\s*(${num})\s*(k)?|\b(${num})\s*(k)?\s*(?:usd|dollars?|bucks|eur|gbp)\b|\b(?:usd|eur|gbp)\s*(${num})\s*(k)?)`,
    "gi",
  );
  for (const m of text.matchAll(re)) {
    const raw = m[1] ?? m[3] ?? m[5];
    const k = m[2] ?? m[4] ?? m[6];
    const v = parseFloat(raw.replace(/,/g, ""));
    found.push(k ? v * 1000 : v);
  }
  for (const n of wordsToNumber(text)) found.push(n);
  return found;
}

// True when every amount in the reply is in the allowed set (cents, compared to the cent).
export function replyIsClean(reply: string, allowedCents: Iterable<number>): boolean {
  const allowed = new Set([...allowedCents]);
  return extractAmounts(reply).every((a) => allowed.has(Math.round(a * 100)));
}

// True when a reply tells the buyer their offer was accepted. The model said "your offer is accepted"
// on a turn where the policy had accepted nothing; the caller only lets this through on a real ACCEPT.
// ponytail: phrase list, not understanding. Add phrasings here as they turn up in the audit log.
export const claimsDeal = (reply: string) =>
  /\b(?:offer|price|that|\{offer\}|\{price\})[^.!?]{0,40}\b(?:is|was|has been|have been) accepted\b|\b(?:i|we|the seller)(?:'ll| will| can| have|'ve| has)? accept(?:s|ed)? (?:your|that|the|\{)|\b(?:it'?s|that'?s|you(?:'ve| have) got|you have) a deal\b|(?:^|[.!?]\s+)deal[!.,]|(?:^|[.!?]\s+)sold[!.,]/i.test(reply);

export const SAFE_TEMPLATE = "Let me double-check the numbers on that. Could you tell me the price you have in mind?";
