"use client";
import { useEffect, useRef, useState } from "react";
import SellerGate from "../../../components/SellerGate";

const field = "w-full rounded border px-3 py-2 text-sm";

type Draft = {
  title: string;
  description: string;
  condition: string;
  notes: string;
  askDollars: number;
  autoAcceptDollars: number;
  floorDollars: number;
  rationale: string;
};

export default function NewListing() {
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [preview, setPreview] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const [imported, setImported] = useState("");

  // "Add to Closer" in the extension opens this page with the marketplace listing in the query string.
  // Fill what it read; the seller still sets the two private prices.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (!q.get("from")) return;
    const f = form.current;
    if (!f) return;
    for (const [name, key] of [["title", "title"], ["description", "description"], ["condition", "condition"], ["imageUrl", "imageUrl"], ["ask", "price"]]) {
      const v = q.get(key);
      const el = f.elements.namedItem(name) as HTMLInputElement | null;
      if (v && el) el.value = v;
    }
    if (q.get("imageUrl")) setPreview(q.get("imageUrl")!);
    setImported(q.get("from") === "facebook" ? "Facebook" : "your listing");
  }, []);

  // Fills the form in place. The seller edits every value before anything is saved.
  function applyDraft(d: Draft) {
    const f = form.current;
    if (!f) return;
    const set = (name: string, value: string) => {
      const el = f.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) el.value = value;
    };
    set("title", d.title);
    set("description", d.description);
    set("condition", d.condition);
    set("notes", d.notes);
    set("ask", String(d.askDollars));
    set("autoAccept", String(d.autoAcceptDollars));
    set("floor", String(d.floorDollars));
    setDraftNote(d.rationale);
  }

  async function draftFromPhoto(file: File) {
    setErr("");
    setDraftNote("");
    setDrafting(true);
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Could not read that file."));
        r.readAsDataURL(file);
      });
      setPreview(imageDataUrl);
      const res = await fetch("/api/seller/listing-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Drafting failed.");
      applyDraft(j.draft);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setDrafting(false);
    }
  }

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
      <form ref={form} onSubmit={submit} className="mx-auto max-w-lg space-y-3">
        <h1 className="text-2xl font-bold">Create listing</h1>
        {imported && (
          <p className="rounded bg-blue-50 p-3 text-sm">
            Filled in from {imported}. Check the details, then set your lowest price and auto-accept price below.
          </p>
        )}

        <div className="rounded border border-dashed bg-slate-50 p-3">
          <label className="block text-sm font-medium">Start from a photo</label>
          <p className="mb-2 text-xs text-slate-500">Closer reads the picture and fills this form in. Check every field, especially the prices.</p>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={drafting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) draftFromPhoto(file);
              }}
              className="text-xs"
            />
            {drafting && <span className="text-xs text-slate-500">Reading the photo…</span>}
          </div>
          {preview && /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview} alt="" className="mt-2 h-24 w-24 rounded object-cover" />}
          {draftNote && <p className="mt-2 text-xs text-slate-600"><b>Why these prices:</b> {draftNote}</p>}
        </div>

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
        <p className="text-xs text-slate-500">
          <b>Asking</b> is what buyers see. <b>Minimum</b> is the lowest the agent may ever go, and it is never shown or hinted at. An offer at or above <b>auto-accept</b> is taken at once; anything between the two is sent to you to approve.
        </p>
        <p className="text-xs text-slate-500">Need minimum ≤ auto-accept ≤ asking. The AI never sees the two private prices while negotiating.</p>
        <button className="rounded bg-slate-900 px-4 py-2 text-white">Create &amp; get link</button>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {link && <p className="rounded bg-green-50 p-3 text-sm">Share this link: <a className="font-medium text-blue-700 underline" href={link}>{link}</a></p>}
      </form>
    </SellerGate>
  );
}
