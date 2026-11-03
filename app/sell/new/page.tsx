"use client";
import { useState } from "react";
import SellerGate from "../../../components/SellerGate";

const field = "w-full rounded border px-3 py-2 text-sm";

export default function NewListing() {
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => Number(f.get(k));
    setErr("");
    const r = await fetch("/api/seller/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: f.get("title"), description: f.get("description"), condition: f.get("condition"), imageUrl: f.get("imageUrl"), notes: f.get("notes"),
        ask: num("ask"), floor: num("floor"), autoAccept: num("autoAccept"),
      }),
    });
    const j = await r.json();
    if (r.ok) setLink(j.url);
    else setErr(j.error ?? "failed");
  }

  return (
    <SellerGate>
      <form onSubmit={submit} className="mx-auto max-w-lg space-y-3">
        <h1 className="text-2xl font-bold">Create listing</h1>
        <input name="title" required placeholder="Title" className={field} />
        <textarea name="description" placeholder="Description" className={field} rows={3} />
        <div className="grid grid-cols-2 gap-3">
          <input name="condition" placeholder="Condition" defaultValue="Good" className={field} />
          <input name="imageUrl" type="url" placeholder="Image URL (optional)" className={field} />
        </div>
        <input name="notes" placeholder="Pickup / shipping notes" className={field} />
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs">Asking price<input name="ask" type="number" min="1" step="1" required className={field} /></label>
          <label className="text-xs">Minimum (private)<input name="floor" type="number" min="1" step="1" required className={field} /></label>
          <label className="text-xs">Auto-accept (private)<input name="autoAccept" type="number" min="1" step="1" required className={field} /></label>
        </div>
        <p className="text-xs text-slate-500">Need minimum ≤ auto-accept ≤ asking. The AI never sees the two private prices.</p>
        <button className="rounded bg-slate-900 px-4 py-2 text-white">Create &amp; get link</button>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {link && <p className="rounded bg-green-50 p-3 text-sm">Share this link: <a className="font-medium text-blue-700 underline" href={link}>{link}</a></p>}
      </form>
    </SellerGate>
  );
}
