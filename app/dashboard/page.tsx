"use client";
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useState } from "react";
import SellerGate from "../../components/SellerGate";

ModuleRegistry.registerModules([AllCommunityModule]);

type Row = { id: string; listing: string; buyer: string; status: string; lastOffer: number | null; counter: number | null; agreed: number | null; paypal: string; updatedAt: string };
type Approval = { id: string; kind: "PRICE" | "CUSTOM"; details: { offerCents?: number; question?: string }; buyer: string; listing: string; currency: string };
type Detail = { id: string; status: string; paypalInvoiceId: string | null; buyerEmail: string | null; messages: { role: string; content: string }[]; audit: { type: string; payload: unknown; createdAt: string }[] };

const money = (p: { value: number | null }) => (p.value == null ? "" : `$${(p.value / 100).toFixed(2).replace(/\.00$/, "")}`);
const PILL: Record<string, string> = { OPEN: "#e0f2fe", AWAITING_APPROVAL: "#fef3c7", AGREED: "#dcfce7", PAID: "#86efac", DECLINED: "#fee2e2", EXPIRED: "#e5e7eb", TAKEN_OVER: "#ede9fe" };

const cols: ColDef<Row>[] = [
  { field: "listing", flex: 1.4 },
  { field: "buyer", flex: 1.2 },
  { field: "status", cellRenderer: (p: { value: string }) => <span style={{ background: PILL[p.value] ?? "#eee", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>{p.value}</span> },
  { field: "lastOffer", headerName: "Last offer", valueFormatter: money, width: 110 },
  { field: "counter", headerName: "Counter", valueFormatter: money, width: 100 },
  { field: "agreed", headerName: "Agreed", valueFormatter: money, width: 100 },
  { field: "paypal", headerName: "PayPal" },
  { field: "updatedAt", headerName: "Last activity", valueFormatter: (p) => new Date(p.value).toLocaleTimeString(), width: 120 },
];

// Mints a pairing token for the browser extension. The server returns the plaintext once; only a hash is stored.
function PairExtension() {
  const [token, setToken] = useState<string>();
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function mint() {
    setErr("");
    setCopied(false);
    const r = await fetch("/api/seller/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "browser extension" }) });
    if (r.ok) setToken((await r.json()).token);
    else setErr("Could not create a token.");
  }

  return (
    <section className="rounded border bg-white p-3 text-sm">
      <h2 className="mb-1 font-semibold">Pair a browser extension</h2>
      <p className="mb-2 text-slate-600">The extension drafts replies in your buyer chats. It uses a pairing token, never your password.</p>
      <button onClick={mint} className="rounded bg-slate-900 px-3 py-1 text-white">{token ? "Create another token" : "Create pairing token"}</button>
      {err && <p className="mt-2 text-red-600">{err}</p>}
      {token && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input readOnly value={token} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded border bg-slate-50 px-2 py-1 font-mono text-xs" />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(token);
                  setCopied(true);
                } catch {
                  setErr("Copy failed. Select the token and copy it by hand.");
                }
              }}
              className="rounded border px-3 py-1"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="rounded bg-amber-100 px-2 py-1 text-amber-900">Copy it now. This token will not be shown again. If you lose it, create a new one.</p>
        </div>
      )}
    </section>
  );
}

// Seller types the buyer's email; the server reads the amount from the agreed price. Nothing here goes to the buyer chat.
function InvoiceForm({ d, onSent }: { d: Detail; onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  if (d.paypalInvoiceId) return <p className="mt-3 rounded border bg-white p-3 text-sm">Invoice sent{d.buyerEmail ? ` to ${d.buyerEmail}` : ""}.</p>;
  if (d.status !== "AGREED") return null;
  async function send() {
    setBusy(true);
    setMsg(undefined);
    const r = await fetch(`/api/negotiations/${d.id}/paypal/invoice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: j.alreadySent ? "Invoice already sent." : `Invoice sent to ${j.sentTo}. The buyer pays on paypal.com.` });
      onSent();
    } else setMsg({ ok: false, text: j.error ?? "Could not send the invoice." });
  }
  return (
    <div className="mt-3 rounded border bg-white p-3 text-sm">
      <h3 className="mb-1 font-semibold">Send PayPal invoice</h3>
      <div className="flex gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Buyer email" className="flex-1 rounded border px-2 py-1" />
        <button onClick={send} disabled={busy || !email} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50">Send PayPal invoice</button>
      </div>
      {msg && <p className={`mt-2 ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}

// Paste mode: the seller pastes what a buyer wrote on another site and copies Closer's reply back by hand.
function PasteReply() {
  const [listings, setListings] = useState<{ slug: string; title: string }[]>([]);
  const [slug, setSlug] = useState("");
  const [thread, setThread] = useState("");
  const [msg, setMsg] = useState("");
  const [out, setOut] = useState("");
  const [pay, setPay] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/seller/listings").then((r) => (r.ok ? r.json() : [])).then((l) => { setListings(l); setSlug((s) => s || l[0]?.slug || ""); });
  }, []);

  async function draft() {
    setErr("");
    setOut("");
    setCopied(false);
    setBusy(true);
    const r = await fetch("/api/seller/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingSlug: slug, threadId: thread.trim(), buyerMessage: msg }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      setOut(j.reply);
      setPay(j.checkoutUrl ?? "");
    } else setErr(j.error ?? "Could not draft a reply.");
  }

  return (
    <section className="rounded border bg-white p-3 text-sm">
      <h2 className="mb-1 font-semibold">Reply to a buyer on another site</h2>
      <p className="mb-2 text-slate-600">Paste what the buyer wrote. Closer drafts the reply; you send it yourself.</p>
      <div className="space-y-2">
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full rounded border px-2 py-1">
          {listings.map((l) => <option key={l.slug} value={l.slug}>{l.title}</option>)}
        </select>
        <input value={thread} onChange={(e) => setThread(e.target.value)} placeholder="Buyer name or thread" className="w-full rounded border px-2 py-1" />
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="Buyer's message" className="w-full rounded border px-2 py-1" />
        <button onClick={draft} disabled={busy || !slug || !thread.trim() || !msg.trim()} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50">{busy ? "Drafting..." : "Draft reply"}</button>
      </div>
      {err && <p className="mt-2 text-red-600">{err}</p>}
      {out && (
        <div className="mt-3 flex gap-2">
          <textarea readOnly value={out} rows={3} className="flex-1 rounded border bg-slate-50 px-2 py-1" />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(out);
                setCopied(true);
              } catch {
                setErr("Copy failed. Select the reply and copy it by hand.");
              }
            }}
            className="self-start rounded border px-3 py-1"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {pay && (
        <p className="mt-2 rounded bg-green-50 px-2 py-1 text-green-900">
          Deal agreed. Send the buyer this PayPal payment link: <span className="font-mono text-xs break-all">{pay}</span>. Or click the deal in the table below to send a PayPal invoice.
        </p>
      )}
    </section>
  );
}

function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [detail, setDetail] = useState<Detail>();
  const [reply, setReply] = useState<Record<string, string>>({});

  const open = useCallback(async (id: string) => {
    const r = await fetch(`/api/seller/negotiations/${id}`);
    if (r.ok) setDetail(await r.json());
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/seller/dashboard");
    if (!r.ok) return;
    const j = await r.json();
    setRows(j.rows);
    setApprovals(j.approvals);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  async function decide(id: string, approve: boolean) {
    await fetch(`/api/seller/approvals/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve, reply: reply[id] || undefined }) });
    refresh();
  }

  return (
    <div className="space-y-6">
      <PairExtension />
      <PasteReply />

      <section>
        <h2 className="mb-2 font-semibold">Approvals {approvals.length > 0 && <span className="rounded-full bg-amber-200 px-2 text-xs">{approvals.length}</span>}</h2>
        {approvals.length === 0 && <p className="text-sm text-slate-500">Nothing waiting on you.</p>}
        <ul className="space-y-2">
          {approvals.map((a) => (
            <li key={a.id} className="rounded border bg-white p-3 text-sm">
              <div className="font-medium">{a.listing} · {a.buyer}</div>
              <div className="text-slate-700">
                {a.kind === "PRICE" ? `Buyer offers $${((a.details.offerCents ?? 0) / 100).toFixed(2)}` : `Question: ${a.details.question}`}
              </div>
              <div className="mt-2 flex gap-2">
                {a.kind === "CUSTOM" && <input value={reply[a.id] ?? ""} onChange={(e) => setReply({ ...reply, [a.id]: e.target.value })} placeholder="Your reply to the buyer" className="flex-1 rounded border px-2 py-1" />}
                <button onClick={() => decide(a.id, true)} className="rounded bg-green-600 px-3 py-1 text-white">{a.kind === "PRICE" ? "Approve" : "Send reply"}</button>
                {a.kind === "PRICE" && <button onClick={() => decide(a.id, false)} className="rounded bg-red-600 px-3 py-1 text-white">Deny</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Negotiations <span className="text-xs font-normal text-slate-500">(click a row for transcript + audit log)</span></h2>
        <div style={{ height: 320 }}>
          <AgGridReact<Row>
            rowData={rows}
            columnDefs={cols}
            defaultColDef={{ sortable: true, resizable: true }}
            getRowId={(p) => p.data.id}
            onRowClicked={(e) => open(e.data!.id)}
          />
        </div>
      </section>

      {detail && <InvoiceForm key={detail.id} d={detail} onSent={() => open(detail.id)} />}

      {detail && (
        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 font-semibold">Transcript</h3>
            <ul className="space-y-1 rounded border bg-white p-3 text-sm">
              {detail.messages.map((m, i) => <li key={i}><b>{m.role}:</b> {m.content}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 font-semibold">Audit log</h3>
            <ul className="space-y-1 rounded border bg-white p-3 font-mono text-xs">
              {detail.audit.map((a, i) => <li key={i}>{new Date(a.createdAt).toLocaleTimeString()} {a.type} {JSON.stringify(a.payload)}</li>)}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <SellerGate>
      <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>
      <Dashboard />
    </SellerGate>
  );
}
