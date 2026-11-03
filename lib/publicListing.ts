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
