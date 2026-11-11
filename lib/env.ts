import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_ENVIRONMENT: z.enum(["SANDBOX", "LIVE"]).default("SANDBOX"),
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: z.string().optional(),
  CURRENCY: z.string().length(3).default("USD"),
  AI_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
  APP_URL: z.string().default("http://localhost:3100"),
  SELLER_PASSWORD: z.string().min(1),
  MAX_ROUNDS: z.coerce.number().int().positive().default(6),
  APPROVAL_TTL_MINUTES: z.coerce.number().positive().default(10),
  RESERVATION_MINUTES: z.coerce.number().positive().default(15),
});

let cached: z.infer<typeof schema> | undefined;
// Lazy so `next build` and tests don't need secrets; first real use fails loudly.
export function env() {
  // On Render, trust the URL the platform reports over a hand-typed APP_URL: a wrong APP_URL sent
  // every payment link to someone else's site.
  return (cached ??= schema.parse({ ...process.env, APP_URL: process.env.RENDER_EXTERNAL_URL || process.env.APP_URL }));
}
