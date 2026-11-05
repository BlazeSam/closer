import { z } from "zod";
import { prisma } from "../../../../lib/db";
import { sellerForToken } from "../../../../lib/extensionAuth";
import { ConflictError } from "../../../../lib/negotiation";
import { allow } from "../../../../lib/ratelimit";
import { MAX_MESSAGE_CHARS, RateLimitError, handleTurn, startNegotiation } from "../../../../lib/sellerAgent";

const body = z.object({
  token: z.string().min(1),
  channel: z.enum(["FB_MARKETPLACE", "KIJIJI", "MOCK"]),
  threadId: z.string().min(1).max(200),
  listingSlug: z.string().min(1).max(120),
  buyerMessage: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

// The extension posts a buyer's message from a Marketplace thread and gets back a reply the seller
// can send. Same policy, same guard, same state machine as the web chat: this is only a new door.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { token, channel, threadId, listingSlug, buyerMessage } = parsed.data;

  const auth = await sellerForToken(token);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!allow(`ext:${auth.id}`, 120, 60_000)) return Response.json({ error: "rate limited" }, { status: 429 });

  // A token may only act on its own seller's listings.
  const listing = await prisma.listing.findUnique({ where: { slug: listingSlug }, select: { sellerId: true } });
  if (!listing || listing.sellerId !== auth.sellerId) return Response.json({ error: "listing not found" }, { status: 404 });

  try {
    const n = await startNegotiation(listingSlug, "HUMAN", `${channel} thread`, "extension", { channel, externalThreadId: threadId });
    if (!n) return Response.json({ error: "listing not found" }, { status: 404 });
    const r = await handleTurn(n.id, buyerMessage);
    return Response.json({ reply: r.reply, status: r.status, priceCents: r.priceCents, checkoutUrl: r.checkoutUrl, pendingApproval: r.pendingApproval });
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: e.message }, { status: 429 });
    if (e instanceof ConflictError) return Response.json({ error: "conflict, retry" }, { status: 409 });
    throw e;
  }
}
