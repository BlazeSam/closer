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

export const substitute = (text: string, v: { price?: number; ask?: number }, currency = "USD") =>
  text
    .replaceAll("{price}", v.price != null ? fmt(v.price, currency) : "")
    .replaceAll("{ask}", v.ask != null ? fmt(v.ask, currency) : "");

export function replyFor(o: Outcome, ask: number, currency: string): string {
  const price = "priceCents" in o ? o.priceCents : undefined;
  return substitute(template(o), { price, ask }, currency);
}
