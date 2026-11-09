"use client";
import { useCallback, useRef, useState } from "react";
import { INVARIANTS } from "../lib/invariants";

type Ev =
  | { type: "buyer"; text: string; offerCents?: number }
  | { type: "seller"; text: string; status: string; priceCents?: number }
  | { type: "done"; status: string; priceCents?: number; checkoutUrl?: string; negotiationId?: string; note?: string };

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

// Two AI agents negotiating, live, on the page. The buyer's budget is enforced in the buyer agent's
// code; the seller's minimum is enforced in lib/policy.ts and is never sent to either model.
export default function AgentDuel({ slug, title, askCents, currency }: { slug: string; title: string; askCents: number; currency: string }) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const budgetCents = Math.round(askCents * 0.9);
  const log = useRef<HTMLDivElement>(null);

  const done = events.find((e) => e.type === "done") as Extract<Ev, { type: "done" }> | undefined;

  const run = useCallback(async () => {
    setEvents([]);
    setErr("");
    setRunning(true);
    try {
      // Put the item back on sale first, so a deal closed by the last visitor doesn't block this one.
      await fetch("/api/demo/reset", { method: "POST" }).catch(() => {});
      const res = await fetch("/api/agent-buyer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, maxBudgetDollars: budgetCents / 100, instructions: "Get a fair price. Close it today." }),
      });
      if (!res.body) throw new Error("No response from the buyer agent.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as Ev;
            setEvents((prev) => [...prev, ev]);
            requestAnimationFrame(() => log.current?.scrollTo({ top: log.current.scrollHeight }));
          } catch {}
        }
      }
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setRunning(false);
    }
  }, [slug, budgetCents]);

  return (
    <section className="overflow-hidden rounded-lg border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
        <div>
          <h2 className="font-semibold">Watch two AI agents close a deal</h2>
          <p className="text-sm text-slate-600">
            {title} · asking {money(askCents, currency)} · the buyer agent has a hard budget of {money(budgetCents, currency)}
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {running ? "Negotiating…" : events.length ? "Run it again" : "Start the negotiation"}
        </button>
      </div>

      <div ref={log} className="max-h-96 space-y-3 overflow-y-auto px-4 py-4">
        {!events.length && !running && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Nothing here is scripted. A buyer agent with a budget it cannot exceed negotiates against the seller&apos;s
              agent, which has a minimum price it cannot go below. Neither model is told the other side&apos;s limit.
            </p>
            <ul className="space-y-1">
              {INVARIANTS.map((s) => (
                <li key={s} className="flex gap-2">
                  <span aria-hidden className="text-emerald-600">
                    ✓
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {events.map((e, i) =>
          e.type === "done" ? null : (
            <div key={i} className={e.type === "buyer" ? "flex justify-start" : "flex justify-end"}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${e.type === "buyer" ? "bg-slate-100" : "bg-blue-50"}`}>
                <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {e.type === "buyer" ? "Buyer agent" : "Seller agent (Closer)"}
                </div>
                <p className="whitespace-pre-wrap text-slate-800">{e.text}</p>
                {e.type === "buyer" && e.offerCents !== undefined && (
                  <div className="mt-1 text-xs text-slate-500">offered {money(e.offerCents, currency)}</div>
                )}
              </div>
            </div>
          ),
        )}

        {running && <p className="text-xs text-slate-500">thinking…</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>

      {done && (
        <div className="border-t bg-slate-50 px-4 py-3 text-sm">
          {done.status === "AGREED" && done.priceCents !== undefined ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <b>Deal at {money(done.priceCents, currency)}.</b> Under the buyer&apos;s {money(budgetCents, currency)} budget,
                and above a minimum neither agent was ever told.
              </span>
              {done.checkoutUrl && (
                <a href={done.checkoutUrl} className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white">
                  Pay with PayPal
                </a>
              )}
            </div>
          ) : (
            <span className="text-slate-600">
              Ended as <b>{done.status}</b>
              {done.note ? `: ${done.note}` : ". No deal, which is the correct outcome when the limits do not overlap."}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
