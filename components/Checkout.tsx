"use client";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useState } from "react";

// Order amount is decided server-side from the stored agreed price; this component never sends a price.
export default function Checkout({ negotiationId, currency, onPaid }: { negotiationId: string; currency: string; onPaid?: () => void }) {
  const [error, setError] = useState("");
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!clientId) return <p className="text-sm text-red-600">PayPal is not configured (NEXT_PUBLIC_PAYPAL_CLIENT_ID).</p>;
  return (
    <div>
      <PayPalScriptProvider options={{ clientId, currency }}>
        <PayPalButtons
          style={{ layout: "vertical" }}
          createOrder={async () => {
            setError("");
            const r = await fetch(`/api/negotiations/${negotiationId}/paypal/order`, { method: "POST" });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? "could not create order");
            return j.id;
          }}
          onApprove={async () => {
            const r = await fetch(`/api/negotiations/${negotiationId}/paypal/capture`, { method: "POST" });
            const j = await r.json();
            if (!r.ok) return setError(j.error ?? "capture failed, you can retry");
            onPaid?.();
          }}
          onError={(e) => setError(String(e?.message ?? e))}
          onCancel={() => setError("Payment cancelled. You can try again.")}
        />
      </PayPalScriptProvider>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
