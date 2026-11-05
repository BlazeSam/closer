// Photo -> draft listing. SELLER-SIDE ONLY: this is the one place a model is asked about prices,
// and its answer is a suggestion the seller edits before anything is saved. Nothing here reaches a
// buyer, and no suggested price is ever used as the floor without the seller confirming it.
import { generateObject } from "ai";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { env } from "./env";

export const DRAFT_PROMPT = `You are helping someone list a second-hand item for sale.
Look at the photo and fill in the listing.
- title: short and specific, including brand and model if you can read them.
- description: two or three sentences a buyer would find useful. Only state what you can see.
- condition: a few words, e.g. "Good, light scuffs".
- notes: pickup or shipping notes if the photo suggests any, otherwise "".
- Suggest three prices in {CURRENCY}, as whole numbers:
  askDollars: a realistic second-hand asking price.
  autoAcceptDollars: at or below the asking price; an offer this good is worth taking at once.
  floorDollars: at or below autoAccept; the lowest sensible price for this item.
- rationale: one sentence on how you judged the price.
Required ordering: floorDollars <= autoAcceptDollars <= askDollars.
If the photo is unclear, say so in the description and price conservatively.`;

export const draftSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(600),
  condition: z.string().max(40),
  notes: z.string().max(200),
  askDollars: z.number().positive(),
  autoAcceptDollars: z.number().positive(),
  floorDollars: z.number().positive(),
  rationale: z.string().max(300),
});

export type Draft = z.infer<typeof draftSchema>;

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// A data URL is attacker-shaped input even from our own form: check the declared type and the
// decoded size before any of it reaches a model.
export function parseImageDataUrl(dataUrl: unknown): { ok: true; bytes: number } | { ok: false; status: number; error: string } {
  if (typeof dataUrl !== "string") return { ok: false, status: 400, error: "No image supplied." };
  const m = /^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) return { ok: false, status: 400, error: "Image must be a base64 data URL." };
  if (!ACCEPTED_IMAGE_TYPES.includes(m[1].toLowerCase())) return { ok: false, status: 400, error: `Image must be one of: ${ACCEPTED_IMAGE_TYPES.join(", ")}.` };
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, status: 413, error: "Image is larger than 5MB." };
  return { ok: true, bytes };
}

const whole = (n: number, fallback: number) => (Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : fallback);

// The model can return prices out of order or absurd. The form enforces floor <= auto <= ask on
// submit anyway, so fix the ordering here rather than handing the seller a draft they cannot save.
export function normalizeDraft(d: Draft): Draft {
  const ask = whole(d.askDollars, 1);
  const autoAccept = Math.min(whole(d.autoAcceptDollars, ask), ask);
  const floor = Math.min(whole(d.floorDollars, autoAccept), autoAccept);
  return {
    ...d,
    title: d.title.trim().slice(0, 120),
    description: d.description.trim().slice(0, 600),
    condition: d.condition.trim().slice(0, 40) || "Used",
    notes: d.notes.trim().slice(0, 200),
    rationale: d.rationale.trim().slice(0, 300),
    askDollars: ask,
    autoAcceptDollars: autoAccept,
    floorDollars: floor,
  };
}

export const hasVisionKey = () => Boolean(env().AI_PROVIDER === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);

// Needs a vision-capable model. Override with AI_MODEL if the default is ever not one.
function visionModel() {
  const id = process.env.AI_MODEL;
  return env().AI_PROVIDER === "openai" ? openai(id ?? "gpt-4o-mini") : anthropic(id ?? "claude-haiku-5-5");
}

export async function draftFromPhoto(imageDataUrl: string, currency: string): Promise<Draft> {
  const { object } = await generateObject({
    model: visionModel(),
    schema: draftSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: DRAFT_PROMPT.replace("{CURRENCY}", currency) },
          { type: "image", image: imageDataUrl },
        ],
      },
    ],
  });
  return normalizeDraft(object);
}
