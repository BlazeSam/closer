"use client";
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useState } from "react";
import SellerGate from "../../components/SellerGate";

ModuleRegistry.registerModules([AllCommunityModule]);

type Row = { id: string; listing: string; buyer: string; status: string; lastOffer: number | null; counter: number | null; agreed: number | null; paypal: string; updatedAt: string };
type Approval = { id: string; kind: "PRICE" | "CUSTOM"; details: { offerCents?: number; question?: string }; buyer: string; listing: string; currency: string };
type Detail = { messages: { role: string; content: string }[]; audit: { type: string; payload: unknown; createdAt: string }[] };

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

function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [detail, setDetail] = useState<Detail>();
  const [reply, setReply] = useState<Record<string, string>>({});

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
            onRowClicked={async (e) => {
              const r = await fetch(`/api/seller/negotiations/${e.data!.id}`);
              if (r.ok) setDetail(await r.json());
            }}
          />
        </div>
      </section>

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
