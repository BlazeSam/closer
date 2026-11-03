"use client";
import { useEffect, useState, type ReactNode } from "react";

// Shared-password gate for seller pages (SCOPE.md section 4). The API enforces it; this is just the form.
export default function SellerGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState<boolean>();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/seller/dashboard").then((r) => setOk(r.ok));
  }, []);

  if (ok === undefined) return <p className="text-slate-500">Loading…</p>;
  if (ok) return <>{children}</>;
  return (
    <form
      className="mx-auto max-w-xs space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await fetch("/api/seller/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
        if (r.ok) setOk(true);
        else setErr("Wrong password");
      }}
    >
      <h1 className="text-xl font-bold">Seller login</h1>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Seller password" className="w-full rounded border px-3 py-2" />
      <button className="w-full rounded bg-slate-900 px-4 py-2 text-white">Log in</button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </form>
  );
}
