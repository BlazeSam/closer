import { randomUUID } from "node:crypto";
import { prisma } from "../../../lib/db";
import { publicSelect } from "../../../lib/publicListing";
import MockMarketplace from "../../../components/MockMarketplace";

// ?listing=<slug> picks the item, ?thread=<id> pins the thread id. Without ?thread a fresh id is made per page load.
export default async function Page({ searchParams }: { searchParams: Promise<{ listing?: string; thread?: string }> }) {
  const q = await searchParams;
  const slug = q.listing || "film-camera";
  const listing = await prisma.listing.findUnique({ where: { slug }, select: publicSelect }).catch(() => null);
  const thread = (q.thread || `mock-${randomUUID().slice(0, 8)}`).slice(0, 100);
  return (
    <MockMarketplace
      thread={thread}
      slug={slug}
      title={listing?.title ?? slug}
      price={listing ? `${listing.currency} ${(listing.askCents / 100).toFixed(2).replace(/\.00$/, "")}` : ""}
      imageUrl={listing?.imageUrl ?? undefined}
    />
  );
}
