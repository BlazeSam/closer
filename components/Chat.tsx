"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Checkout from "./Checkout";

type Msg = { role: "BUYER" | "SELLER_AGENT" | "SELLER" | "SYSTEM"; content: string };
type Snap = { status: string; agreedCents: number | null; messages: Msg[] };

export default function Chat({ slug, currency }: { slug: string; currency: string }) {
  const [id, setId] = useState<string>();
  const [snap, setSnap] = useState<Snap>({ status: "OPEN", agreedCents: null, messages: [] });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const key = `closer:${slug}`;

  const load = useCallback(async (nid: string) => {
    const r = await fetch(`/api/negotiations/${nid}`);
    if (r.ok) setSnap(await r.json());
  }, []);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        setId(saved);
        load(saved);
      }
    } catch {}
  }, [key, load]);

  // Poll while we wait on the seller, or while a deal is awaiting payment.
  useEffect(() => {
    if (!id || !["AWAITING_APPROVAL", "AGREED"].includes(snap.status)) return;
    const t = setInterval(() => load(id), 3000);
    return () => clearInterval(t);
  }, [id, snap.status, load]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [snap.messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setErr("");
    setText("");
    setSnap((s) => ({ ...s, messages: [...s.messages, { role: "BUYER", content: message }] }));
    try {
      const r = await fetch(`/api/chat/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ negotiationId: id, message }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "request failed");
      setId(j.negotiationId);
      try { sessionStorage.setItem(key, j.negotiationId); } catch {}
      await load(j.negotiationId);
    } catch (e2) {
      setErr(String((e2 as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const closed = ["PAID", "DECLINED", "EXPIRED"].includes(snap.status);
  return (
    <div className="flex h-[28rem] flex-col rounded border bg-white">
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {snap.messages.length === 0 && <p className="text-slate-400">Say hi, or make an offer.</p>}
        {snap.messages.map((m, i) => (
          <div key={i} className={m.role === "BUYER" ? "text-right" : ""}>
            <span className={`inline-block max-w-[85%] whitespace-pre-wrap rounded px-3 py-2 ${m.role === "BUYER" ? "bg-blue-600 text-white" : m.role === "SYSTEM" ? "bg-green-100" : "bg-slate-100"}`}>{m.content}</span>
          </div>
        ))}
        {snap.status === "AWAITING_APPROVAL" && <p className="text-slate-500">Checking with the seller…</p>}
        <div ref={bottom} />
      </div>
      {snap.status === "AGREED" && id && snap.agreedCents != null && (
        <div className="border-t p-3">
          <p className="mb-2 font-medium">Agreed: {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(snap.agreedCents / 100)}</p>
          <Checkout negotiationId={id} currency={currency} onPaid={() => load(id)} />
        </div>
      )}
      {snap.status === "PAID" && <div className="border-t bg-green-50 p-3 text-sm font-medium text-green-800">Paid. Receipt sent by PayPal.</div>}
      {err && <p className="px-3 text-sm text-red-600">{err}</p>}
      <form onSubmit={send} className="flex gap-2 border-t p-2">
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy || closed || snap.status === "AGREED"} maxLength={1000} placeholder="Type a message or offer…" className="flex-1 rounded border px-3 py-2 text-sm disabled:bg-slate-50" />
        <button disabled={busy || closed || snap.status === "AGREED"} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "…" : "Send"}</button>
      </form>
    </div>
  );
}
