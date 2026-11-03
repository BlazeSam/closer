import { env } from "../../../../../lib/env";
import { prisma } from "../../../../../lib/db";
import { publicSelect } from "../../../../../lib/publicListing";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = await prisma.listing.findUnique({ where: { slug }, select: publicSelect });
  if (!l) return Response.json({ error: "not found" }, { status: 404 });
  const { askCents, ...rest } = l;
  return Response.json({
    ...rest,
    askCents,
    protocol: {
      negotiate: { method: "POST", url: `${env().APP_URL}/api/agent/listings/${slug}/negotiate`, body: { negotiationId: "string?", buyerLabel: "string", message: "string", offerCents: "integer cents?" } },
      poll: `${env().APP_URL}/api/agent/negotiations/{negotiationId}`,
      notes: "Prices are integer cents. The seller agent is an AI with hard price limits enforced in code. When status is AGREED, a human owner completes payment at checkoutUrl via PayPal.",
    },
  });
}
