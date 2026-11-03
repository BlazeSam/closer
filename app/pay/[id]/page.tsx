import { notFound } from "next/navigation";
import Checkout from "../../../components/Checkout";
import { prisma } from "../../../lib/db";
import { sweep } from "../../../lib/negotiation";
import { fmt } from "../../../lib/replies";

export const dynamic = "force-dynamic";

// Landing page for agent buyers: the human owner approves the payment here with one tap.
export default async function Pay({ params }: { params: Promise<{ id: string }> }) {
  await sweep();
  const n = await prisma.negotiation.findUnique({ where: { id: (await params).id }, select: { id: true, status: true, agreedCents: true, listing: { select: { title: true, currency: true } } } });
  if (!n) notFound();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{n.listing.title}</h1>
      {n.status === "AGREED" && n.agreedCents != null ? (
        <>
          <p>Your agent agreed a price of <b>{fmt(n.agreedCents, n.listing.currency)}</b>. Approve the payment with PayPal:</p>
          <Checkout negotiationId={n.id} currency={n.listing.currency} />
        </>
      ) : n.status === "PAID" ? (
        <p className="rounded bg-green-50 p-3 text-green-800">Paid. Thank you!</p>
      ) : (
        <p className="rounded bg-amber-100 p-3">This deal is not payable right now (status: {n.status}).</p>
      )}
    </div>
  );
}
