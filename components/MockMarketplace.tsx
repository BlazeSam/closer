"use client";
import { useEffect, useRef, useState } from "react";

// A generic marketplace-style chat, made up for demos. It is NOT Facebook or Meta and copies none of their
// branding. It exists so the Closer extension can be tried without a Facebook account.
//
// DOM HOOKS (the contract with extension/selectors.js; the extension's MOCK selectors target exactly these):
//   [data-closer-thread]         root of the conversation. Value = stable thread id.
//                                Also carries data-closer-listing = listing slug.
//   [data-closer-messages]       the message list container.
//   [data-closer-message]        one message. data-closer-role = "buyer" (inbound) | "seller" (outbound),
//                                data-closer-id = unique id within the thread.
//   [data-closer-composer]       the seller's text box (a contenteditable role=textbox, like real chat apps).
//   [data-closer-send]           the seller's send button.
// The "send as buyer" box is page furniture for the demo and deliberately carries NO hooks.
type Msg = { id: number; role: "buyer" | "seller"; text: string };

export default function MockMarketplace({ thread, slug, title, price, imageUrl }: { thread: string; slug: string; title: string; price: string; imageUrl?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [asBuyer, setAsBuyer] = useState("");
  const composer = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const next = useRef(1);

  const add = (role: Msg["role"], text: string) => setMsgs((m) => [...m, { id: next.current++, role, text }]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs]);

  function sendSeller() {
    const t = composer.current?.innerText.trim();
    if (!t) return;
    add("seller", t);
    if (composer.current) composer.current.innerHTML = "";
  }

  function sendBuyer() {
    const t = asBuyer.trim();
    if (!t) return;
    add("buyer", t);
    setAsBuyer("");
  }

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div data-closer-thread={thread} data-closer-listing={slug} className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b bg-slate-50 p-3">
          {imageUrl ? <img src={imageUrl} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="h-12 w-12 rounded bg-slate-200" />}
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Marketplace chat (demo mock)</div>
            <div className="font-semibold">{title}</div>
            <div className="text-sm text-slate-600">{price}</div>
          </div>
        </div>

        <div ref={list} data-closer-messages className="flex h-80 flex-col gap-2 overflow-y-auto p-3">
          {msgs.length === 0 && <p className="m-auto text-sm text-slate-400">No messages yet. Use the buyer box below.</p>}
          {msgs.map((m) => (
            <div key={m.id} data-closer-message data-closer-role={m.role} data-closer-id={`${thread}-${m.id}`} className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.role === "buyer" ? "self-start bg-slate-200" : "self-end bg-emerald-600 text-white"}`}>
              {m.text}
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2 border-t p-3">
          <div
            ref={composer}
            data-closer-composer
            contentEditable
            role="textbox"
            aria-label="Message the buyer"
            suppressContentEditableWarning
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendSeller();
              }
            }}
            className="max-h-32 min-h-9 flex-1 overflow-y-auto rounded border px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <button data-closer-send onClick={sendSeller} className="rounded bg-emerald-600 px-4 py-2 text-sm text-white">Send</button>
        </div>
      </div>

      <div className="rounded-lg border border-dashed bg-white p-3 text-sm">
        <div className="mb-1 font-medium">Demo control: send as buyer</div>
        <div className="flex gap-2">
          <input
            value={asBuyer}
            onChange={(e) => setAsBuyer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendBuyer()}
            placeholder="e.g. would you take 150?"
            className="flex-1 rounded border px-2 py-1"
          />
          <button onClick={sendBuyer} className="rounded bg-slate-900 px-3 py-1 text-white">Send as buyer</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Thread id: <code>{thread}</code> (stays the same for this page load; add <code>?thread=</code> to pin it). Listing: <code>{slug}</code> (change with <code>?listing=</code>).</p>
      </div>
    </div>
  );
}
