import { randomBytes } from "node:crypto";
import { z } from "zod";
import { isSeller, unauthorized } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { env } from "../../../../lib/env";

const dollars = z.number().positive().max(1_000_000);
const body = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().max(2000).default(""),
    condition: z.string().max(60).default("Used"),
    imageUrl: z.string().url().optional().or(z.literal("")),
    notes: z.string().max(500).default(""),
    ask: dollars,
    floor: dollars,
    autoAccept: dollars,
  })
  .refine((b) => b.floor <= b.autoAccept && b.autoAccept <= b.ask, { message: "need floor <= auto-accept <= asking price" });

export async function POST(req: Request) {
  if (!isSeller(req)) return unauthorized();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  const seller = await prisma.seller.upsert({ where: { id: "demo-seller" }, update: {}, create: { id: "demo-seller", name: "Demo Seller", email: "seller@example.com" } });
  const slug = `${b.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${randomBytes(2).toString("hex")}`;
  const c = (d: number) => Math.round(d * 100);
  const l = await prisma.listing.create({
    data: {
      slug, title: b.title, description: b.description, condition: b.condition, imageUrl: b.imageUrl || null, notes: b.notes,
      askCents: c(b.ask), currency: env().CURRENCY, sellerId: seller.id,
      private: { create: { floorCents: c(b.floor), autoAcceptCents: c(b.autoAccept) } },
    },
  });
  return Response.json({ slug: l.slug, url: `${env().APP_URL}/l/${l.slug}` });
}

export async function GET(req: Request) {
  if (!isSeller(req)) return unauthorized();
  return Response.json(await prisma.listing.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { slug: true, title: true } }));
}
