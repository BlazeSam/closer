"use client";
import { useEffect, useRef, useState } from "react";
import SellerGate from "../../../components/SellerGate";

const field = "w-full rounded border px-3 py-2 text-sm";
const label = "block text-sm font-medium";

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

const DELIVERY = { pickup: "Pickup only", shipping: "Can ship", both: "Pickup or shipping" } as const;

export default function NewListing() {
  // The form mounts only after the password gate passes, so its effects see the real form.
  return (
    <SellerGate>
      <ListingForm />
    </SellerGate>
  );
}

function ListingForm() {
  const [link, setLink] = useState("");
  const [adText, setAdText] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState("");
  const [imported, setImported] = useState("");
  const form = useRef<HTMLFormElement>(null);

  const set = (name: string, value: string) => {
    const el = form.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) el.value = value;
  };

  // "Add to Closer" in the extension opens this page with the marketplace listing in the query string.
  // Fill what it read; the seller still answers the questions below.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (!q.get("from")) return;
    for (const [name, key] of [["title", "title"], ["description", "description"], ["condition", "condition"], ["imageUrl", "imageUrl"], ["ask", "price"]]) {
      const v = q.get(key);
      if (v) set(name, v);
    }
    // Preview only Facebook's own image host: a crafted link must not make this page load an arbitrary URL.
    const img = q.get("imageUrl");
    if (img && /^https:\/\/[^/]+\.fbcdn\.net\//.test(img)) setPreview(img);
    setImported(q.get("from") === "facebook" ? "Facebook" : "your listing");
  }, []);

  // The photo answers what it can. The two private prices are left for the seller to answer: the draft's
  // guesses are shown next to the questions, never saved without the seller typing them in.
  function applyDraft(d: Draft) {
    set("title", d.title);
    set("description", d.description);
    set("condition", d.condition);
    set("area", d.notes);
    set("ask", String(d.askDollars));
    setDraft(d);
  }

  async function draftFromPhoto(file: File) {
    setErr("");
    setDraft(null);
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
    const str = (k: string) => String(f.get(k) ?? "").trim();
    setErr("");
    // Same rule the server enforces, said in plain words before the round trip.
    if (!(num("floor") <= num("autoAccept") && num("autoAccept") <= num("ask"))) {
      return setErr("Your lowest price must be at or below your “yes straight away” price, and that must be at or below the asking price.");
    }
    const extra = str("extra");
    const delivery = DELIVERY[str("delivery") as keyof typeof DELIVERY] ?? "";
    const r = await fetch("/api/seller/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: str("title"),
        description: [str("description"), extra && `Seller notes: ${extra}`].filter(Boolean).join("\n\n").slice(0, 2000),
        condition: str("condition") || "Used",
        imageUrl: str("imageUrl"),
        notes: [delivery, str("area")].filter(Boolean).join(". ").slice(0, 500),
        ask: num("ask"),
        floor: num("floor"),
        autoAccept: num("autoAccept"),
      }),
    });
    const j = await r.json();
    if (r.ok) {
      setLink(j.url);
      // Public fields only: never the lowest or auto-accept price.
      setAdText([str("title"), `$${num("ask")}`, str("description"), extra, `Condition: ${str("condition") || "Used"}`, [delivery, str("area")].filter(Boolean).join(". ")].filter(Boolean).join("\n\n"));
    }
    else setErr(j.error ?? "Could not save. Check the fields and try again.");
  }

  const hint = (n?: number) => (n ? <span className="font-normal text-slate-500"> Closer&apos;s guess: {n}.</span> : null);

  return (
    <form ref={form} onSubmit={submit} className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-bold">Sell something</h1>
      {imported && (
        <p className="rounded bg-blue-50 p-3 text-sm">Filled in from {imported}. Check the details, then answer the questions in step 3.</p>
      )}

      <section className="rounded border border-dashed bg-slate-50 p-3">
        <h2 className={label}>1. Add a photo</h2>
        <p className="mb-2 text-xs text-slate-500">Closer looks at it and fills in what it can. You can also skip this and type everything.</p>
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
        {drafting && <p className="mt-2 text-xs text-slate-500">Looking at your photo…</p>}
        {preview && /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview} alt="" className="mt-2 h-24 w-24 rounded object-cover" />}
        {draft && <p className="mt-2 text-xs text-slate-600"><b>How Closer priced it:</b> {draft.rationale}</p>}
      </section>

      <section className="space-y-3">
        <h2 className={label}>2. Check the details</h2>
        <input name="title" required placeholder="What is it? e.g. Canon AE-1 film camera" className={field} />
        <textarea name="description" placeholder="Description buyers will see" className={field} rows={3} />
        <label className="block text-xs">Asking price (what buyers see)<input name="ask" type="number" min="1" step="1" required className={field} /></label>
        <input name="imageUrl" type="url" placeholder="Photo link (optional)" className={field} />
      </section>

      <section className={`space-y-4 rounded border p-3 ${draft || imported ? "border-blue-300 bg-blue-50/40" : ""}`}>
        <h2 className={label}>3. A few quick questions</h2>
        <p className="text-xs text-slate-500">A photo can&apos;t tell us these. Your answers to the price questions are private: buyers never see them.</p>

        <label className={label}>
          What condition is it in?
          <input name="condition" placeholder="e.g. Good, light scratches" defaultValue="Good" className={`${field} mt-1 font-normal`} />
        </label>

        <label className={label}>
          Anything a buyer should know that the photo doesn&apos;t show? <span className="font-normal text-slate-500">(optional)</span>
          <textarea name="extra" rows={2} placeholder="e.g. battery holds a charge for a day, one small dent on the back, charger included" className={`${field} mt-1 font-normal`} />
        </label>

        <label className={label}>
          What&apos;s the lowest price you&apos;d accept?{hint(draft?.floorDollars)}
          <input name="floor" type="number" min="1" step="1" required className={`${field} mt-1 font-normal`} />
          <small className="font-normal text-slate-500">Closer never goes below this, and never hints at it.</small>
        </label>

        <label className={label}>
          At what price would you say yes straight away?{hint(draft?.autoAcceptDollars)}
          <input name="autoAccept" type="number" min="1" step="1" required className={`${field} mt-1 font-normal`} />
          <small className="font-normal text-slate-500">Offers at or above this are accepted at once. Offers between this and your lowest price come to you to approve.</small>
        </label>

        <fieldset className="text-sm">
          <legend className="font-medium">Pickup or shipping?</legend>
          {Object.entries(DELIVERY).map(([v, text]) => (
            <label key={v} className="mr-4 inline-flex items-center gap-1">
              <input type="radio" name="delivery" value={v} defaultChecked={v === "pickup"} /> {text}
            </label>
          ))}
          <input name="area" placeholder="Area for pickup, or shipping details (not your home address)" className={`${field} mt-2`} />
        </fieldset>
      </section>

      <button className="rounded bg-slate-900 px-4 py-2 text-white">Save and get my link</button>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {link && <p className="rounded bg-green-50 p-3 text-sm">Saved. Share this link with buyers: <a className="font-medium text-blue-700 underline" href={link}>{link}</a></p>}
      {adText && (
        // Closer cannot post for you: Facebook has no public listing API. This copies the ad text and opens
        // Facebook's own "create listing" page; you paste, add the photo and publish there yourself.
        <div className="rounded border p-3 text-sm">
          <p className="mb-2">Also selling on Facebook Marketplace? Copy the ad, then paste it into Facebook&apos;s form and add your photo.</p>
          <button
            type="button"
            className="rounded bg-blue-700 px-3 py-2 text-white"
            onClick={async () => {
              await navigator.clipboard.writeText(adText).then(() => setCopied(true), () => setCopied(false));
              window.open("https://www.facebook.com/marketplace/create/item", "_blank", "noopener");
            }}
          >
            Copy ad and open Facebook Marketplace
          </button>
          {copied && <p className="mt-2 text-xs text-slate-600">Copied. Paste it into the title and description on Facebook.</p>}
          <textarea readOnly value={adText} rows={6} className={`${field} mt-2 font-mono text-xs`} />
        </div>
      )}
    </form>
  );
}
