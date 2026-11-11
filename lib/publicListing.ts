// The ONLY listing shape buyer-facing code may select. Never includes ListingPrivate.
export const publicSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  condition: true,
  imageUrl: true,
  askCents: true,
  currency: true,
  notes: true,
  status: true,
} as const;

// The seeded listings the public demo runs on. The landing page shows only these, and the demo reset
// may only touch these: a listing a seller creates is reached by its own link, not advertised here.
export const DEMO_SLUGS = ["road-bike", "standing-desk", "film-camera"];
