import { z } from "zod";
import { isSeller, unauthorized } from "../../../../lib/auth";
import { ConflictError } from "../../../../lib/negotiation";
import { allow } from "../../../../lib/ratelimit";
import { MAX_MESSAGE_CHARS, RateLimitError, handleTurn, startNegotiation } from "../../../../lib/sellerAgent";

const body = z.object({
  listingSlug: z.string().min(1).max(120),
  threadId: z.string().min(1).max(200),
  buyerMessage: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

// SELLER ONLY. Paste mode: the seller pastes a buyer's message from any other site and gets Closer's
// reply to send by hand. Same policy, guard and state machine as the extension route; channel is MOCK
// because the Channel enum has no "pasted" value and we do not change the schema for a label.
export async function POST(req: Request) {
  if (!isSeller(req)) return unauthorized();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { listingSlug, threadId, buyerMessage } = parsed.data;
  if (!allow("paste:seller", 120, 60_000)) return Response.json({ error: "rate limited" }, { status: 429 });

  try {
    // "paste:" keeps a pasted thread from colliding with an extension thread of the same name.
    const n = await startNegotiation(listingSlug, "HUMAN", threadId, "paste", { channel: "MOCK", externalThreadId: `paste:${threadId}` });
    if (!n) return Response.json({ error: "listing not found" }, { status: 404 });
    const r = await handleTurn(n.id, buyerMessage);
    // checkoutUrl goes to the seller, who can pass it on: the buyer never visited this site.
    return Response.json({ reply: r.reply, status: r.status, priceCents: r.priceCents, checkoutUrl: r.checkoutUrl, pendingApproval: r.pendingApproval });
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: e.message }, { status: 429 });
    if (e instanceof ConflictError) return Response.json({ error: "conflict, retry" }, { status: 409 });
    throw e;
  }
}
