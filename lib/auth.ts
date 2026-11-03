import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const COOKIE = "closer_seller";
// ponytail: single shared password, cookie = hash of it. Real auth is out of scope (SCOPE.md section 15).
const token = () => createHash("sha256").update(`closer:${env().SELLER_PASSWORD}`).digest("hex");

export function passwordOk(pw: string): boolean {
  const a = Buffer.from(createHash("sha256").update(pw).digest("hex"));
  const b = Buffer.from(createHash("sha256").update(env().SELLER_PASSWORD).digest("hex"));
  return timingSafeEqual(a, b);
}

export const sessionValue = token;

export function isSeller(req: Request): boolean {
  const m = /(?:^|;\s*)closer_seller=([a-f0-9]+)/.exec(req.headers.get("cookie") ?? "");
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(token());
  return a.length === b.length && timingSafeEqual(a, b);
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
