import { z } from "zod";
import { prisma } from "./db";
import { ConflictError } from "./negotiation";
import { RateLimitError, handleTurn, startNegotiation } from "./sellerAgent";
import { allow, clientIp } from "./ratelimit";

const body = z.object({
  negotiationId: z.string().optional(),
  buyerLabel: z.string().max(60).optional(),
  message: z.string().min(1).max(1000),
  offerCents: z.number().int().positive().optional(),
});

// Shared by the human chat route and the agent-to-agent API: same seller agent, same policy.
export async function negotiateHandler(req: Request, slug: string, buyerType: "HUMAN" | "AGENT") {
  const ip = clientIp(req);
  if (!allow(`ip:${ip}`, 30, 60_000)) return Response.json({ error: "rate limited" }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  const b = parsed.data;
  if (buyerType === "HUMAN" && b.offerCents !== undefined) delete b.offerCents; // humans go through the LLM/parse path

  try {
    let id = b.negotiationId;
    if (id) {
      const n = await prisma.negotiation.findFirst({ where: { id, listing: { slug } }, select: { id: true } });
      if (!n) return Response.json({ error: "negotiation not found" }, { status: 404 });
    } else {
      const n = await startNegotiation(slug, buyerType, b.buyerLabel ?? (buyerType === "AGENT" ? "agent" : "Buyer"), ip);
      if (!n) return Response.json({ error: "listing not found" }, { status: 404 });
      id = n.id;
    }
    return Response.json(await handleTurn(id, b.message, b.offerCents));
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: e.message }, { status: 429 });
    if (e instanceof ConflictError) return Response.json({ error: "conflict, retry" }, { status: 409 });
    throw e;
  }
}
