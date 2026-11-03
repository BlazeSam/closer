import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const c = (d: number) => d * 100;

const listings = [
  { slug: "road-bike", title: "Giant road bike, 54cm", description: "Aluminium frame, Shimano 105, new tires last month. Light wear on the bar tape.", condition: "Good", ask: 220, floor: 170, auto: 200, notes: "Pickup downtown. Can meet at a bike shop for a test ride.", imageUrl: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800" },
  { slug: "standing-desk", title: "Electric standing desk, 140x70", description: "Dual motor, memory presets, walnut top. Moving abroad, must go.", condition: "Like new", ask: 300, floor: 220, auto: 270, notes: "Disassembles in 10 minutes. Pickup only.", imageUrl: "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=800" },
  { slug: "film-camera", title: "Canon AE-1 35mm film camera", description: "Working shutter and light meter, 50mm f/1.8 lens, strap included.", condition: "Good", ask: 180, floor: 130, auto: 160, notes: "Can ship insured, buyer pays shipping.", imageUrl: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800" },
];

async function main() {
  const seller = await prisma.seller.upsert({ where: { id: "demo-seller" }, update: {}, create: { id: "demo-seller", name: "Demo Seller", email: "seller@example.com" } });
  for (const l of listings) {
    const data = { title: l.title, description: l.description, condition: l.condition, imageUrl: l.imageUrl, notes: l.notes, askCents: c(l.ask), currency: process.env.CURRENCY ?? "USD", sellerId: seller.id };
    const row = await prisma.listing.upsert({ where: { slug: l.slug }, update: { ...data, status: "ACTIVE", reservedByNegotiationId: null, reservedUntil: null }, create: { slug: l.slug, ...data } });
    await prisma.listingPrivate.upsert({
      where: { listingId: row.id },
      update: { floorCents: c(l.floor), autoAcceptCents: c(l.auto) },
      create: { listingId: row.id, floorCents: c(l.floor), autoAcceptCents: c(l.auto) },
    });
  }
  console.log(`seeded ${listings.length} listings`);
}

main().finally(() => prisma.$disconnect());
