import { isSeller, unauthorized } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { mintToken } from "../../../../lib/extensionAuth";

// Mint a pairing token for the extension. The plaintext is returned once and never again.
export async function POST(req: Request) {
  if (!isSeller(req)) return unauthorized();
  const label = String((await req.json().catch(() => ({}))).label ?? "").slice(0, 60);
  const seller = await prisma.seller.upsert({
    where: { id: "demo-seller" },
    update: {},
    create: { id: "demo-seller", name: "Demo Seller", email: "seller@example.com" },
  });
  return Response.json({ token: await mintToken(seller.id, label) });
}
