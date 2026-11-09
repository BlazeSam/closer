import Link from "next/link";
import AgentDuel from "../components/AgentDuel";
import { prisma } from "../lib/db";
import { fmt } from "../lib/replies";
import { publicSelect } from "../lib/publicListing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const listings = await prisma.listing.findMany({ select: publicSelect, orderBy: { createdAt: "asc" } }).catch(() => []);
  // The duel needs something to sell. Prefer the desk (biggest gap, so the haggling is visible).
  const hero = listings.find((l) => l.slug === "standing-desk") ?? listings[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Delegate the sale. Keep the control.</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Closer is an AI agent that sells your second-hand items within hard limits you set. It drafts replies where you
          already sell, holds your minimum price even under pressure, and settles through PayPal. Buyers can send their own
          agent to negotiate with it.
        </p>
      </div>

      {hero ? (
        <AgentDuel slug={hero.slug} title={hero.title} askCents={hero.askCents} currency={hero.currency} />
      ) : (
        <p className="rounded border bg-white p-4 text-sm text-slate-500">
          No listings yet. Run <code>npm run seed</code>.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["The AI talks, the code decides", "Every price comes from a policy in code. The model never sees your minimum and never writes a number of its own."],
          ["Pressure changes nothing", "A buyer who repeats themselves without improving their offer gets the same answer. Concessions have to be earned."],
          ["Paid through PayPal", "Either a card checkout or a PayPal invoice the buyer pays on paypal.com. The amount is read from the agreed deal, never from the chat."],
        ].map(([h, body]) => (
          <div key={h} className="rounded border bg-white p-4">
            <h3 className="font-medium">{h}</h3>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Try it yourself</h2>
        {listings.length === 0 && <p className="text-sm text-slate-500">No listings yet.</p>}
        <ul className="grid gap-3 sm:grid-cols-3">
          {listings.map((l) => (
            <li key={l.id} className="rounded border bg-white p-3">
              <Link href={`/l/${l.slug}`} className="font-medium hover:underline">
                {l.title}
              </Link>
              <div className="text-sm text-slate-500">
                {fmt(l.askCents, l.currency)} · {l.status}
              </div>
              <div className="mt-1 flex gap-3 text-xs">
                <Link href={`/l/${l.slug}`} className="text-blue-600 hover:underline">
                  Haggle with it
                </Link>
                <Link href={`/agent-buyer?slug=${l.slug}`} className="text-blue-600 hover:underline">
                  Send your own agent
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap gap-4 text-sm">
        <Link href="/sell/new" className="text-blue-600 hover:underline">Create a listing from a photo</Link>
        <Link href="/dashboard" className="text-blue-600 hover:underline">Seller dashboard</Link>
        <Link href="/demo/marketplace" className="text-blue-600 hover:underline">Marketplace demo (browser extension)</Link>
      </section>
    </div>
  );
}
