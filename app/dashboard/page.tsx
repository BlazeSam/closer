"use client";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type GridReadyEvent } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SellerGate from "../../components/SellerGate";

ModuleRegistry.registerModules([AllCommunityModule]); // Community only: no Enterprise modules, no license key

type Row = { id: string; listing: string; buyer: string; channel: string; status: string; currency: string; asking: number | null; lastOffer: number | null; counter: number | null; agreed: number | string | null; round: number | null; paypal: string; updatedAt: string };
type Approval = { id: string; kind: "PRICE" | "CUSTOM"; details: { offerCents?: number; question?: string }; buyer: string; listing: string; currency: string };
type Detail = { id: string; status: string; paypalInvoiceId: string | null; buyerEmail: string | null; messages: { role: string; content: string }[]; audit: { type: string; payload: unknown; createdAt: string }[] };

const fmt = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
const money = (p: { value: number | string | null; data?: Row }) => (p.value == null ? "" : typeof p.value === "string" ? p.value : fmt(p.value, p.data?.currency ?? "USD"));
const PILL: Record<string, string> = { OPEN: "#e0f2fe", AWAITING_APPROVAL: "#fef3c7", AGREED: "#dcfce7", PAID: "#86efac", DECLINED: "#fee2e2", EXPIRED: "#e5e7eb", TAKEN_OVER: "#ede9fe" };

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

const CHIPS = [
  { label: "All", statuses: [] as string[] },
  { label: "Open", statuses: ["OPEN"] },
  { label: "Needs approval", statuses: ["AWAITING_APPROVAL"] },
  { label: "Agreed", statuses: ["AGREED"] },
  { label: "Paid", statuses: ["PAID"] },
  { label: "Closed", statuses: ["DECLINED", "EXPIRED", "TAKEN_OVER"] },
];

const theme = themeQuartz.withParams({ backgroundColor: "#ffffff", foregroundColor: "#0f172a", headerBackgroundColor: "#f8fafc", borderColor: "#e2e8f0", accentColor: "#0f172a", fontSize: 13, rowHeight: 34, headerHeight: 36 });

const cols: ColDef<Row>[] = [
  { field: "listing", flex: 1.4, minWidth: 160, filter: "agTextColumnFilter" },
  { field: "buyer", flex: 1.2, minWidth: 140, filter: "agTextColumnFilter" },
  { field: "channel", headerName: "Channel", minWidth: 130, filter: "agTextColumnFilter" },
  { field: "status", minWidth: 150, filter: "agTextColumnFilter", filterParams: { maxNumConditions: 3 }, cellRenderer: (p: { value: string }) => <span style={{ background: PILL[p.value] ?? "#eee", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>{p.value}</span> },
  { field: "asking", headerName: "Asking", valueFormatter: money, width: 100, filter: "agNumberColumnFilter" },
  { field: "lastOffer", headerName: "Last offer", valueFormatter: money, width: 110, filter: "agNumberColumnFilter" },
  { field: "counter", headerName: "Counter", valueFormatter: money, width: 100, filter: "agNumberColumnFilter" },
  { field: "agreed", headerName: "Agreed", valueFormatter: money, width: 100, filter: "agNumberColumnFilter" },
  {
    headerName: "% of asking", width: 120, filter: "agNumberColumnFilter",
    valueGetter: (p) => (typeof p.data?.agreed === "number" && p.data.asking ? Math.round((p.data.agreed / p.data.asking) * 100) : null),
    valueFormatter: (p) => (p.value == null ? "" : `${p.value}%`),
  },
  { field: "round", headerName: "Rounds", width: 100, filter: "agNumberColumnFilter" },
  { field: "paypal", headerName: "PayPal", minWidth: 120, filter: "agTextColumnFilter" },
  { field: "updatedAt", headerName: "Last activity", width: 130, sort: "desc", filter: false, valueFormatter: (p) => (p.value ? ago(p.value) : ""), tooltipValueGetter: (p) => (p.value ? new Date(p.value).toLocaleString() : "") },
];

// One click: mint a pairing token and hand it to the extension's pair.js on this page via postMessage (same
// origin only). If no extension answers, fall back to showing the token for manual paste. Only a hash is stored.
function PairExtension() {
  const [token, setToken] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function connect() {
    setErr("");
    setCopied(false);
    setToken(undefined);
    const r = await fetch("/api/seller/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "browser extension" }) });
    if (!r.ok) return setErr("Could not connect. Try again.");
    const t: string = (await r.json()).token;
    const ok = await new Promise<boolean>((resolve) => {
      const on = (e: MessageEvent) => { if (e.source === window && e.data?.type === "closer-paired") { cleanup(); resolve(true); } };
      const timer = setTimeout(() => { cleanup(); resolve(false); }, 1500);
      const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", on); };
      window.addEventListener("message", on);
      window.postMessage({ type: "closer-pair", token: t }, location.origin);
    });
    setConnected(ok);
    if (!ok) setToken(t);
  }

  return (
    <section className="rounded border bg-white p-3 text-sm">
      <h2 className="mb-1 font-semibold">Reply from Facebook Marketplace or Kijiji</h2>
      <p className="mb-2 text-slate-600">The Closer browser extension types a reply into your buyer chats for you to check and send. It never sees your password.</p>
      {connected ? (
        <p className="rounded bg-green-100 px-2 py-1 text-green-900">This browser is connected. Click the Closer icon in your toolbar, choose the item you are selling, then open a buyer chat.</p>
      ) : (
        <button onClick={connect} className="rounded bg-slate-900 px-3 py-1 text-white">Connect this browser</button>
      )}
      {err && <p className="mt-2 text-red-600">{err}</p>}
      {token && <p className="mt-2 text-slate-700">No Closer extension found in this browser. Install it (Load unpacked, the <code>extension/</code> folder), reload this page and click again. Or paste this token under Advanced in the extension popup:</p>}
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
  const gridApi = useRef<GridApi<Row> | null>(null);
  const [quick, setQuick] = useState("");
  const [chip, setChip] = useState("All");
  const [pinned, setPinned] = useState<Partial<Row>[]>([]);
  const counts = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.label, c.statuses.length ? rows.filter((r) => c.statuses.includes(r.status)).length : rows.length])), [rows]);

  // Summary of the rows passing the current filters. Pinned data is only set when it changed, so polling does not churn the grid.
  const summarize = useCallback(() => {
    const api = gridApi.current;
    if (!api) return;
    let n = 0, paid = 0, total = 0;
    const cur = new Set<string>();
    api.forEachNodeAfterFilter((node) => {
      if (!node.data) return;
      n++;
      if (node.data.status === "PAID" && typeof node.data.agreed === "number") { paid++; total += node.data.agreed; cur.add(node.data.currency); }
    });
    const next = [{ id: "summary", listing: `${n} negotiation${n === 1 ? "" : "s"} shown`, status: `${paid} paid`, agreed: cur.size > 1 ? "mixed" : paid ? total : null, currency: [...cur][0] ?? "USD" }];
    setPinned((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  // Keep the chip highlight in sync with whatever the status column filter currently holds.
  const syncChip = useCallback(() => {
    const m = gridApi.current?.getFilterModel()?.status;
    const vals: string[] = !m ? [] : m.conditions ? m.conditions.map((c: { filter: string }) => c.filter) : [m.filter];
    setChip(CHIPS.find((c) => c.statuses.length === vals.length && c.statuses.every((s) => vals.includes(s)))?.label ?? "");
  }, []);

  function pickChip(statuses: string[]) {
    const model = !statuses.length ? null : statuses.length === 1 ? { filterType: "text", type: "equals", filter: statuses[0] } : { filterType: "text", operator: "OR", conditions: statuses.map((s) => ({ filterType: "text", type: "equals", filter: s })) };
    gridApi.current?.setColumnFilterModel("status", model).then(() => gridApi.current?.onFilterChanged());
  }

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
      <section className="rounded border bg-slate-50 p-3 text-sm">
        <h2 className="mb-1 font-semibold">{rows.length ? "How this works" : "Get started in 3 steps"}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-slate-700">
          <li><a href="/sell/new" className="text-blue-600 underline">List an item</a>: a photo, your asking price and the lowest price you will take. You get a link to share.</li>
          <li>Buyers chat on that link, or click <b>Connect this browser</b> below so Closer drafts replies in your Facebook Marketplace or Kijiji chats.</li>
          <li>Offers that need you show up under <b>Approvals</b>. Deals and PayPal payments show up in the table.</li>
        </ol>
      </section>
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
                {a.kind === "PRICE" ? `Buyer offers ${new Intl.NumberFormat("en-US", { style: "currency", currency: a.currency }).format((a.details.offerCents ?? 0) / 100)}` : `Question: ${a.details.question}`}
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
        <h2 className="mb-2 font-semibold">Negotiations <span className="text-xs font-normal text-slate-500">(select a row for transcript + audit log)</span></h2>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          {CHIPS.map((c) => (
            <button key={c.label} onClick={() => pickChip(c.statuses)} className={`rounded-full border px-3 py-0.5 ${chip === c.label ? "bg-slate-900 text-white" : "bg-white"}`}>
              {c.label} <span className="opacity-70">{counts[c.label]}</span>
            </button>
          ))}
          <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Search all columns..." className="ml-auto w-56 rounded border px-2 py-1" />
          <button onClick={() => gridApi.current?.exportDataAsCsv({ fileName: "negotiations.csv" })} className="rounded border bg-white px-3 py-1">Export CSV</button>
        </div>
        <div style={{ height: 540 }}>
          <AgGridReact<Row>
            theme={theme}
            rowData={rows}
            columnDefs={cols}
            defaultColDef={{ sortable: true, resizable: true, floatingFilter: true }}
            getRowId={(p) => p.data.id}
            quickFilterText={quick}
            rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
            pagination
            paginationPageSize={20}
            paginationPageSizeSelector={false}
            animateRows
            tooltipShowDelay={300}
            pinnedBottomRowData={pinned}
            rowClassRules={{ "row-awaiting": (p) => p.data?.status === "AWAITING_APPROVAL", "row-paid": (p) => p.data?.status === "PAID" }}
            onGridReady={(e: GridReadyEvent<Row>) => { gridApi.current = e.api; summarize(); }}
            onModelUpdated={summarize}
            onFilterChanged={() => { syncChip(); summarize(); }}
            onSelectionChanged={(e) => { const r = e.api.getSelectedRows()[0]; if (r) open(r.id); }}
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
