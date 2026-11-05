"use client";
import { useCallback, useEffect, useState } from "react";
import { INVARIANTS } from "../lib/invariants";

type Entry = { at: string; kind: "policy" | "guard" | "model" | "payment"; label: string; detail?: string };

const DOT: Record<Entry["kind"], string> = { policy: "bg-blue-500", guard: "bg-amber-500", model: "bg-slate-400", payment: "bg-emerald-500" };

// Shows what the system did behind each reply. The server redacts this (lib/trace.ts): the policy
// branch and any guard-blocked text never reach the browser, so this panel cannot leak the floor.
export default function DefensePanel({ negotiationId }: { negotiationId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    if (!negotiationId) return;
    try {
      const r = await fetch(`/api/negotiations/${negotiationId}/trace`);
      if (r.ok) setEntries((await r.json()).entries ?? []);
    } catch {}
  }, [negotiationId]);

  useEffect(() => {
    if (!negotiationId || !open) return;
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [negotiationId, open, load]);

  return (
    <section className="rounded border bg-slate-900 text-slate-100">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold">
        <span>Under the hood</span>
        <span className="text-xs font-normal text-slate-400">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-700 px-3 py-3 text-xs">
          <ul className="space-y-1 text-slate-300">
            {INVARIANTS.map((s) => (
              <li key={s} className="flex gap-2">
                <span aria-hidden className="text-emerald-400">✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-slate-700 pt-2">
            {!negotiationId && <p className="text-slate-400">Send a message to see each decision as it happens. Try talking the agent below its price.</p>}
            {negotiationId && entries.length === 0 && <p className="text-slate-400">No decisions yet.</p>}
            <ol className="space-y-2">
              {entries.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex gap-2">
                  <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[e.kind]}`} />
                  <span>
                    <span className="text-slate-100">{e.label}</span>
                    {e.detail && <span className="block text-slate-400">{e.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
