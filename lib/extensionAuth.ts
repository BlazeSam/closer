// Pairing tokens for the browser extension. The extension is installed on a machine we do not
// control, so it never sees SELLER_PASSWORD: it gets a revocable token scoped to one seller.
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

// Returns the plaintext once. Only the hash is persisted, so a database leak is not a seller takeover.
export async function mintToken(sellerId: string, label = ""): Promise<string> {
  const token = `clsr_${randomBytes(24).toString("hex")}`;
  await prisma.sellerToken.create({ data: { hash: digest(token), sellerId, label } });
  return token;
}

export async function sellerForToken(token: string | undefined) {
  if (!token) return null;
  const row = await prisma.sellerToken.findUnique({ where: { hash: digest(token) } });
  if (!row || row.revokedAt) return null;
  await prisma.sellerToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return row;
}
