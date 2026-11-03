import { notFound } from "next/navigation";
import Chat from "../../../components/Chat";
import { prisma } from "../../../lib/db";
import { publicSelect } from "../../../lib/publicListing";
import { fmt } from "../../../lib/replies";

export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const l = await prisma.listing.findUnique({ where: { slug: (await params).slug }, select: publicSelect });
  if (!l) notFound();
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        {l.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={l.imageUrl} alt={l.title} className="aspect-video w-full rounded object-cover" />}
        <h1 className="text-2xl font-bold">{l.title}</h1>
        <div className="text-xl">{fmt(l.askCents, l.currency)} <span className="text-sm text-slate-500">asking · {l.condition}</span></div>
        <p className="text-slate-700">{l.description}</p>
        {l.notes && <p className="text-sm text-slate-500">{l.notes}</p>}
        {l.status !== "ACTIVE" && <p className="rounded bg-amber-100 px-3 py-2 text-sm">This item is {l.status.toLowerCase()}.</p>}
      </div>
      <div className="space-y-2">
        <p className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-900">You&apos;re chatting with <b>Closer</b>, an AI agent acting for the seller.</p>
        <Chat slug={l.slug} currency={l.currency} />
      </div>
    </div>
  );
}
