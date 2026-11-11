// Pure sales-analytics math over plain arrays (no DB), so it can be unit tested.
export type AListing = { id: string; title: string; askCents: number; currency: string };
export type ANeg = {
  listingId: string;
  channel: string; // already a label, see channelLabel()
  status: string;
  paid: boolean;
  round: number;
  agreedCents: number | null;
  bestOfferCents: number | null; // buyer's last offer, shown when nothing was agreed
  firstMessageAt: number | null; // ms
  agreedAt: number | null; // ms
};
export type Metrics = {
  items: number; agreedItems: number; paidItems: number;
  sellThroughPct: number | null; avgDealPctOfAsk: number | null; medianMinutesToDeal: number | null; avgRounds: number | null;
};
export const CHANNELS = ["Web chat", "Buyer agent", "Facebook", "Kijiji", "Pasted"];

export const channelLabel = (buyerType: string, channel: string) =>
  buyerType === "AGENT" ? "Buyer agent" : channel === "FB_MARKETPLACE" ? "Facebook" : channel === "KIJIJI" ? "Kijiji" : channel === "MOCK" ? "Pasted" : "Web chat";

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const isDeal = (n: ANeg) => n.paid || n.status === "AGREED" || n.status === "PAID";

function metrics(listings: AListing[], negs: ANeg[], itemsBase: number): Metrics {
  const ask = new Map(listings.map((l) => [l.id, l.askCents]));
  const deals = negs.filter(isDeal);
  const agreedItems = new Set(deals.map((n) => n.listingId)).size;
  const paidItems = new Set(negs.filter((n) => n.paid || n.status === "PAID").map((n) => n.listingId)).size;
  const ratios = deals.filter((n) => n.agreedCents != null && ask.get(n.listingId)).map((n) => (n.agreedCents! / ask.get(n.listingId)!) * 100);
  const mins = deals.filter((n) => n.firstMessageAt != null && n.agreedAt != null).map((n) => Math.max(0, n.agreedAt! - n.firstMessageAt!) / 60000);
  const avg = mean(ratios), rounds = mean(deals.map((n) => n.round)), med = median(mins);
  return {
    items: itemsBase, agreedItems, paidItems, sellThroughPct: pct(agreedItems, itemsBase),
    avgDealPctOfAsk: avg == null ? null : Math.round(avg), medianMinutesToDeal: med == null ? null : Math.round(med * 10) / 10, avgRounds: rounds == null ? null : Math.round(rounds * 10) / 10,
  };
}

export function computeAnalytics(listings: AListing[], negs: ANeg[]) {
  const totals = metrics(listings, negs, listings.length);
  const perChannel = CHANNELS.map((channel) => {
    const ns = negs.filter((n) => n.channel === channel);
    return { channel, ...metrics(listings, ns, new Set(ns.map((n) => n.listingId)).size) }; // items = listings that saw this channel
  });
  const perItem = listings.map((l) => {
    const ns = negs.filter((n) => n.listingId === l.id), deals = ns.filter(isDeal);
    const price = deals.length ? Math.max(...deals.map((n) => n.agreedCents ?? 0)) : Math.max(0, ...ns.map((n) => n.bestOfferCents ?? 0)) || null;
    return {
      title: l.title, currency: l.currency, askCents: l.askCents, negotiations: ns.length, priceCents: price, priceIsAgreed: deals.length > 0,
      pctOfAsk: price && l.askCents ? Math.round((price / l.askCents) * 100) : null,
      status: ns.some((n) => n.paid || n.status === "PAID") ? "paid" : deals.length ? "agreed" : "listed",
      rounds: deals.length ? deals[0].round : ns.length ? Math.max(...ns.map((n) => n.round)) : null,
    };
  });
  return { totals, perChannel, perItem };
}
