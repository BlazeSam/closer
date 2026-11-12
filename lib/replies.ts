import type { Outcome } from "./negotiation";

export const fmt = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

// Replies carry {price} placeholders; digits only ever enter via substitute() from a tool result.
export function template(o: Outcome): string {
  switch (o.kind) {
    case "ACCEPT":
      return "Deal! {price} it is. You can pay securely with PayPal below.";
    case "COUNTER":
      return "Thanks for the offer. The best I can do right now is {price}.";
    case "FINAL":
      return "I'm at my limit: {price} is my final offer.";
    case "PENDING":
      return "Let me check with the seller on that. One moment...";
    case "INVALID":
      return "I couldn't make sense of that offer. Could you give me a dollar amount?";
    case "UNAVAILABLE":
      return "Sorry, this item is no longer available.";
    case "CLOSED":
      return "This conversation is closed.";
  }
}

// The model is told to always write {price}, but outcomes like PENDING/INVALID/UNAVAILABLE carry no
// price. Dropping the placeholder leaves "I can't accept  for this item", so fall back to words.
// ponytail: fixed wording, not grammar-aware; good enough because the model writes the sentence round it.
// The model sometimes writes its own symbol before a slot ("CA${price}"), which came out as "CA$CA$157" (seen
// 12 Nov). fmt() already adds the symbol, so drop any symbol written right before a slot.
export const substitute = (text: string, v: { price?: number; ask?: number; offer?: number }, currency = "USD") =>
  text
    .replace(/(?<![A-Za-z])(?:[A-Z]{0,3}[$€£]\s?)+(?=\{(?:price|ask|offer)\})/g, "")
    .replaceAll("{price}", v.price != null ? fmt(v.price, currency) : "that amount")
    .replaceAll("{ask}", v.ask != null ? fmt(v.ask, currency) : "the asking price")
    // The buyer's own number. Without this the model wrote both halves of "I can't accept {price},
    // but I can do {price}" with the same slot, so the sentence contradicted itself.
    .replaceAll("{offer}", v.offer != null ? fmt(v.offer, currency) : "your offer");

export function replyFor(o: Outcome, ask: number, currency: string): string {
  const price = "priceCents" in o ? o.priceCents : undefined;
  return substitute(template(o), { price, ask }, currency);
}
