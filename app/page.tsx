import Link from "next/link";
import { prisma } from "../lib/db";
import { fmt } from "../lib/replies";
import { publicSelect } from "../lib/publicListing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const listings = await prisma.listing.findMany({ select: publicSelect, orderBy: { createdAt: "asc" } }).catch(() => []);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Delegate the sale. Keep the control.</h1>
        <p className="mt-2 text-slate-600">
          Closer is an AI agent that sells your second-hand items within hard limits you set. Buyers, or their AI agents, negotiate with it, and PayPal settles the deal.
        </p>
      </div>
      <section>
        <h2 className="mb-2 font-semibold">Demo listings</h2>
        {listings.length === 0 && <p className="text-sm text-slate-500">No listings yet. Run <code>npm run seed</code>.</p>}
        <ul className="grid gap-3 sm:grid-cols-3">
          {listings.map((l) => (
            <li key={l.id} className="rounded border bg-white p-3">
              <Link href={`/l/${l.slug}`} className="font-medium hover:underline">{l.title}</Link>
              <div className="text-sm text-slate-500">{fmt(l.askCents, l.currency)} · {l.status}</div>
              <Link href={`/agent-buyer?slug=${l.slug}`} className="text-xs text-blue-600 hover:underline">Send a buyer agent</Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex gap-4 text-sm">
        <Link href="/sell/new" className="text-blue-600 hover:underline">Create a listing</Link>
        <Link href="/dashboard" className="text-blue-600 hover:underline">Seller dashboard</Link>
        <Link href="/agent-buyer" className="text-blue-600 hover:underline">Buyer agent demo</Link>
      </section>
    </div>
  );
}
