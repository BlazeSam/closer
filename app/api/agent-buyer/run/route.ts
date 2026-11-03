import { z } from "zod";
import { runBuyerAgent } from "../../../../lib/buyerAgent";
import { allow, clientIp } from "../../../../lib/ratelimit";

export const maxDuration = 120;
const body = z.object({ slug: z.string().min(1), maxBudgetDollars: z.number().positive().max(100000), instructions: z.string().max(300).default("") });

// Streams NDJSON events (both sides of the transcript) as the buyer agent runs.
export async function POST(req: Request) {
  if (!allow(`buyer:${clientIp(req)}`, 5, 60_000)) return Response.json({ error: "rate limited" }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { slug, maxBudgetDollars, instructions } = parsed.data;
  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      try {
        for await (const e of runBuyerAgent({ origin, slug, maxBudgetCents: Math.round(maxBudgetDollars * 100), instructions })) ctrl.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      } catch (e) {
        ctrl.enqueue(enc.encode(JSON.stringify({ type: "done", status: "ERROR", note: String(e) }) + "\n"));
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
