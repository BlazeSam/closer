// Buyer agent. Budget is enforced in CODE: no offer above maxBudgetCents ever leaves this module,
// and a price above budget is never accepted. Talks to the seller only through the public agent API.
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

export type BuyerEvent =
  | { type: "buyer"; text: string; offerCents?: number }
  | { type: "seller"; text: string; status: string; priceCents?: number }
  | { type: "done"; status: string; priceCents?: number; checkoutUrl?: string; negotiationId?: string; note?: string };

type SellerReply = { negotiationId: string; reply: string; status: string; priceCents?: number; checkoutUrl?: string };

const MAX_TURNS = 10;

// The call is server-to-server, so without this every visitor would share one IP against the seller's
// per-IP limits. Pass the real visitor's IP along instead.
async function send(origin: string, slug: string, body: object, clientIp: string): Promise<SellerReply> {
  const res = await fetch(`${origin}/api/agent/listings/${slug}/negotiate`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": clientIp }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`seller API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function poll(origin: string, id: string) {
  for (let i = 0; i < 60; i++) {
    const r = await (await fetch(`${origin}/api/agent/negotiations/${id}`)).json();
    if (!r.pendingApproval) return r;
    await new Promise((r2) => setTimeout(r2, 2000));
  }
  return { status: "AWAITING_APPROVAL" };
}

const hasKey = () => Boolean(process.env.AI_PROVIDER === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);

export async function* runBuyerAgent(p: { origin: string; clientIp: string; slug: string; maxBudgetCents: number; instructions: string }): AsyncGenerator<BuyerEvent> {
  const info = await (await fetch(`${p.origin}/api/agent/listings/${p.slug}`)).json();
  if (info.error) throw new Error(info.error);
  const ask: number = info.askCents;
  // The listing's own currency. Without it the buyer agent talked in USD at a seller pricing in CAD,
  // and both sides treated the numbers as the same money.
  const currency: string = typeof info.currency === "string" ? info.currency : "USD";
  let negotiationId: string | undefined;
  let last: SellerReply | undefined;

  // One step of the loop. `wanted` is what the buyer brain proposes; code clamps it to budget.
  const step = async (message: string, wanted?: number): Promise<SellerReply> => {
    const offerCents = wanted === undefined ? undefined : Math.min(Math.max(1, Math.round(wanted)), p.maxBudgetCents);
    return (last = await send(p.origin, p.slug, { negotiationId, buyerLabel: "buyer-agent", message, offerCents }, p.clientIp));
  };

  const events: BuyerEvent[] = [];
  const emit = (e: BuyerEvent) => events.push(e);
  const flush = function* () {
    while (events.length) yield events.shift()!;
  };

  if (!hasKey()) {
    // Deterministic fallback brain: open at 60% of budget, climb 10% of budget per turn.
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const offer = Math.min(p.maxBudgetCents, Math.round((0.6 + 0.1 * turn) * p.maxBudgetCents));
      const msg = `I can offer ${currency} ${(offer / 100).toFixed(0)}.`;
      yield { type: "buyer", text: msg, offerCents: offer };
      const r = await step(msg, offer);
      negotiationId = r.negotiationId;
      yield { type: "seller", text: r.reply, status: r.status, priceCents: r.priceCents };
      let cur = r;
      if (cur.status === "AWAITING_APPROVAL") {
        const s = await poll(p.origin, cur.negotiationId);
        yield { type: "seller", text: `(seller decision: ${s.status})`, status: s.status, priceCents: s.priceCents };
        cur = { ...cur, ...s };
      }
      if (cur.status === "AGREED") {
        if (cur.priceCents !== undefined && cur.priceCents > p.maxBudgetCents) return yield { type: "done", status: "OVER_BUDGET", note: "Agreed price exceeds budget; refusing to pay." };
        return yield { type: "done", status: "AGREED", priceCents: cur.priceCents, checkoutUrl: cur.checkoutUrl, negotiationId };
      }
      if (["DECLINED", "EXPIRED", "PAID"].includes(cur.status)) return yield { type: "done", status: cur.status, negotiationId };
    }
    return yield { type: "done", status: "NO_DEAL", negotiationId, note: `No deal in ${MAX_TURNS} turns.` };
  }

  const model = process.env.AI_PROVIDER === "openai" ? openai(process.env.AI_MODEL ?? "gpt-4o-mini") : anthropic(process.env.AI_MODEL ?? "claude-haiku-5-5");
  let turns = 0;
  const send_to_seller = tool({
    description: "Send a message (and optionally an offer in dollars) to the seller's AI agent. Returns the seller's reply.",
    inputSchema: z.object({ message: z.string().max(500), offerDollars: z.number().positive().optional() }),
    execute: async ({ message, offerDollars }) => {
      if (++turns > MAX_TURNS) return { error: "turn limit reached, stop" };
      const wanted = offerDollars === undefined ? undefined : offerDollars * 100;
      const sent = wanted === undefined ? undefined : Math.min(Math.round(wanted), p.maxBudgetCents);
      emit({ type: "buyer", text: message, offerCents: sent });
      const r = await step(message, wanted);
      negotiationId = r.negotiationId;
      emit({ type: "seller", text: r.reply, status: r.status, priceCents: r.priceCents });
      let cur = r;
      if (cur.status === "AWAITING_APPROVAL") {
        const s = await poll(p.origin, cur.negotiationId);
        emit({ type: "seller", text: `(seller decision: ${s.status})`, status: s.status, priceCents: s.priceCents });
        cur = { ...cur, ...s };
        last = cur;
      }
      return { reply: r.reply, status: cur.status, agreedPriceDollars: cur.priceCents !== undefined ? cur.priceCents / 100 : undefined };
    },
  });

  const run = generateText({
    model,
    system: `You are a buyer agent negotiating for a human. All prices are in ${currency}; every amount you name is ${currency} and you never convert to or mention another currency. Item asking price is ${currency} ${(ask / 100).toFixed(0)}. Your hard budget is ${currency} ${(p.maxBudgetCents / 100).toFixed(0)}; never offer or accept more. Start well below budget and move up gradually. Instructions from your owner: ${p.instructions || "none"}. Use send_to_seller. Stop when status is AGREED, DECLINED, or EXPIRED, or after about ${MAX_TURNS} messages.`,
    prompt: "Start negotiating for the item.",
    tools: { send_to_seller },
    stopWhen: stepCountIs(MAX_TURNS + 2),
  });
  // Stream events as the loop produces them.
  let finished = false;
  const done = run.finally(() => (finished = true));
  while (!finished) {
    yield* flush();
    await new Promise((r) => setTimeout(r, 200));
  }
  await done.catch((e) => emit({ type: "done", status: "ERROR", note: String(e) }));
  yield* flush();

  const f = last as SellerReply | undefined;
  if (f?.status === "AGREED") {
    if (f.priceCents !== undefined && f.priceCents > p.maxBudgetCents) return yield { type: "done", status: "OVER_BUDGET", note: "Agreed price exceeds budget; refusing to pay." };
    return yield { type: "done", status: "AGREED", priceCents: f.priceCents, checkoutUrl: f.checkoutUrl, negotiationId };
  }
  yield { type: "done", status: f?.status ?? "NO_DEAL", negotiationId };
}
