"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type Ev =
  | { type: "buyer"; text: string; offerCents?: number }
  | { type: "seller"; text: string; status: string; priceCents?: number }
  | { type: "done"; status: string; priceCents?: number; checkoutUrl?: string; negotiationId?: string; note?: string };

function Form() {
  const qs = useSearchParams();
  const [slug, setSlug] = useState(qs.get("slug") ?? "road-bike");
  const [budget, setBudget] = useState(190);
  const [instructions, setInstructions] = useState("I want it before the weekend.");
  const [events, setEvents] = useState<Ev[]>([]);
  const [running, setRunning] = useState(false);
  const done = events.find((e) => e.type === "done") as Extract<Ev, { type: "done" }> | undefined;

  async function start() {
    setEvents([]);
    setRunning(true);
    const res = await fetch("/api/agent-buyer/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: slug.split("/").pop(), maxBudgetDollars: budget, instructions }) });
    if (!res.body) return setRunning(false);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines.filter(Boolean)) setEvents((e) => [...e, JSON.parse(l)]);
    }
    setRunning(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Buyer agent demo</h1>
      <p className="text-sm text-slate-600">An AI buyer with a code-enforced budget negotiates with Closer through the public agent API. If they agree, you approve the payment with PayPal.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">Listing slug or URL<input value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" /></label>
        <label className="text-xs">Max budget ($)<input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-full rounded border px-3 py-2 text-sm" /></label>
        <label className="text-xs sm:col-span-3">Instructions<input value={instructions} onChange={(e) => setInstructions(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" /></label>
      </div>
      <button onClick={start} disabled={running} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{running ? "Negotiating…" : "Start"}</button>
      <ul className="space-y-2 text-sm">
        {events.filter((e) => e.type !== "done").map((e, i) => (
          <li key={i} className={e.type === "buyer" ? "text-right" : ""}>
            <span className={`inline-block max-w-[85%] rounded px-3 py-2 ${e.type === "buyer" ? "bg-blue-600 text-white" : "bg-slate-100"}`}>
              <b className="mr-1 text-xs opacity-70">{e.type === "buyer" ? "Buyer agent" : "Closer"}</b>{(e as { text: string }).text}
            </span>
          </li>
        ))}
      </ul>
      {done && (
        <div className="rounded border bg-white p-3 text-sm">
          <b>Result: {done.status}</b> {done.priceCents != null && `at $${(done.priceCents / 100).toFixed(2)}`} {done.note}
          {done.checkoutUrl && done.negotiationId && (
            <p className="mt-2"><Link className="font-medium text-blue-700 underline" href={`/pay/${done.negotiationId}`}>Approve payment with PayPal →</Link></p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
