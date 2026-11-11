import { prisma } from "../../../../lib/db";
import { sellerForToken } from "../../../../lib/extensionAuth";

// The popup's listing picker. Token in the POST body, never in a URL; only this seller's listings come back.
export async function POST(req: Request) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  const auth = await sellerForToken(typeof token === "string" ? token : undefined);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  const listings = await prisma.listing.findMany({ where: { sellerId: auth.sellerId }, orderBy: { createdAt: "desc" }, take: 100, select: { slug: true, title: true } });
  return Response.json(listings);
}
