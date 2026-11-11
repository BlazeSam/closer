import Link from "next/link";
import AgentDuel from "../components/AgentDuel";
import { prisma } from "../lib/db";
import { fmt } from "../lib/replies";
import { DEMO_SLUGS, publicSelect } from "../lib/publicListing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const listings = await prisma.listing.findMany({ where: { slug: { in: DEMO_SLUGS } }, select: publicSelect, orderBy: { createdAt: "asc" } }).catch(() => []);
  // The duel needs something to sell. Prefer the desk (biggest gap, so the haggling is visible).
  const hero = listings.find((l) => l.slug === "standing-desk") ?? listings[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Let an AI agent haggle for you. Get paid with PayPal.</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Selling something second-hand? Closer answers your buyers, never goes below the lowest price you set, and takes the
          payment through PayPal. Buying? Chat with it yourself, or send your own agent to get you a better deal.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border-2 border-slate-900 bg-white p-5">
          <h2 className="text-xl font-bold">I&apos;m selling</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li><b>List your item.</b> Snap a photo, set your asking price and the lowest price you&apos;ll take.</li>
            <li><b>Share your Closer link</b> with buyers, or add the browser extension and Closer types replies in your Facebook Marketplace or Kijiji chats.</li>
            <li><b>Get paid.</b> When a buyer agrees, they pay through PayPal. You approve anything unusual from your dashboard.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/sell/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">List an item</Link>
            <Link href="/dashboard" className="rounded border px-4 py-2 text-sm">Open my dashboard</Link>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-5">
          <h2 className="text-xl font-bold">I&apos;m buying</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li><b>Open the seller&apos;s Closer link</b>, or pick an item below.</li>
            <li><b>Make an offer</b> in the chat. Closer answers straight away, day or night.</li>
            <li><b>Or send your own agent</b> with your budget. It haggles for you and stops at your limit.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            {hero && <Link href={`/l/${hero.slug}`} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">Try buying an item</Link>}
            {hero && <Link href={`/agent-buyer?slug=${hero.slug}`} className="rounded border px-4 py-2 text-sm">Send my own agent</Link>}
          </div>
        </div>
      </section>


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
        <h2 className="mb-2 font-semibold">Items for sale right now (demo)</h2>
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
        <Link href="/demo/marketplace" className="text-blue-600 hover:underline">See the browser extension on a practice chat</Link>
      </section>
    </div>
  );
}
