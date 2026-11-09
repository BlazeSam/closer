// The invoice path hands money handling to PayPal, so what matters here is the trust boundary:
// an invoice must only count as paid for the right negotiation, the right amount and the right
// currency. All pure, no network.
import "dotenv/config";
import { describe, expect, it } from "vitest";
import { centsToValue, invoiceDraft, verifyInvoicePaid, type PayPalInvoice } from "../lib/paypal";

const inv = (over: Partial<PayPalInvoice> = {}): PayPalInvoice => ({
  id: "INV-1",
  status: "PAID",
  detail: { reference: "neg-1", currency_code: "CAD" },
  amount: { currency_code: "CAD", value: "251.00" },
  ...over,
});

describe("invoice payment verification", () => {
  it("accepts a paid invoice for the agreed amount", () => {
    expect(verifyInvoicePaid(inv(), 25100, "CAD", "neg-1").ok).toBe(true);
    expect(verifyInvoicePaid(inv({ status: "MARKED_AS_PAID" }), 25100, "CAD", "neg-1").ok).toBe(true);
  });

  it("rejects an invoice that is not paid", () => {
    for (const status of ["SENT", "DRAFT", "CANCELLED", "PARTIALLY_PAID", "REFUNDED"]) {
      expect(verifyInvoicePaid(inv({ status }), 25100, "CAD", "neg-1").ok, status).toBe(false);
    }
  });

  it("rejects an invoice belonging to a different negotiation", () => {
    // Without this, paying any cheap invoice would mark someone else's deal as paid.
    const r = verifyInvoicePaid(inv({ detail: { reference: "neg-OTHER" } }), 25100, "CAD", "neg-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/another negotiation/);
  });

  it("rejects a short payment or the wrong currency", () => {
    expect(verifyInvoicePaid(inv({ amount: { currency_code: "CAD", value: "25.10" } }), 25100, "CAD", "neg-1").ok).toBe(false);
    expect(verifyInvoicePaid(inv({ amount: { currency_code: "USD", value: "251.00" } }), 25100, "CAD", "neg-1").ok).toBe(false);
    expect(verifyInvoicePaid(inv({ amount: undefined }), 25100, "CAD", "neg-1").ok).toBe(false);
  });

  it("rejects an invoice with no negotiation reference", () => {
    expect(verifyInvoicePaid(inv({ detail: {} }), 25100, "CAD", "neg-1").ok).toBe(false);
  });
});

describe("invoice draft", () => {
  const d = invoiceDraft({ agreedCents: 25100, currency: "CAD", negotiationId: "neg-1", title: "Electric standing desk", buyerEmail: "b@example.com", invoiceNumber: "0007" });

  it("bills the agreed amount and carries the negotiation id", () => {
    expect(d.items[0].unit_amount.value).toBe("251.00");
    expect(d.detail.reference).toBe("neg-1");
    expect(d.primary_recipients[0].billing_info.email_address).toBe("b@example.com");
  });

  it("keeps whole-dollar amounts and cents correct", () => {
    expect(centsToValue(30000)).toBe("300.00");
    expect(centsToValue(25199)).toBe("251.99");
    expect(centsToValue(1)).toBe("0.01");
  });

  it("truncates a hostile title instead of sending it whole", () => {
    const long = invoiceDraft({ agreedCents: 100, currency: "CAD", negotiationId: "n", title: "x".repeat(500), buyerEmail: "b@example.com", invoiceNumber: "1" });
    expect(long.items[0].name.length).toBeLessThanOrEqual(200);
  });
});

// PayPal's create-invoice returns only a self link, so the id has to come out of the href. Getting
// this wrong produced a request to "/v2/invoicing/invoices/undefined/send".
describe("invoice id from the create response", () => {
  it("reads the id out of the self link", async () => {
    const { invoiceIdFromHref } = await import("../lib/paypal");
    expect(invoiceIdFromHref("https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-SL9X-NAMS-E44Y-KSKQ")).toBe("INV2-SL9X-NAMS-E44Y-KSKQ");
    expect(invoiceIdFromHref("https://api-m.paypal.com/v2/invoicing/invoices/INV2-ABCD/")).toBe("INV2-ABCD");
    for (const bad of [undefined, "", "https://example.com/other/path", "https://api.paypal.com/v2/invoicing/invoices/"]) {
      expect(invoiceIdFromHref(bad), String(bad)).toBeUndefined();
    }
  });
});
