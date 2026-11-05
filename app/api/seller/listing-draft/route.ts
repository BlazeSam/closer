import { isSeller, unauthorized } from "../../../../lib/auth";
import { env } from "../../../../lib/env";
import { draftFromPhoto, hasVisionKey, parseImageDataUrl } from "../../../../lib/listingDraft";
import { allow } from "../../../../lib/ratelimit";

// Seller-only. Returns a DRAFT the seller edits; nothing is saved here, and no suggested price is
// ever used without the seller confirming it on the form.
export async function POST(req: Request) {
  if (!isSeller(req)) return unauthorized();
  if (!allow("listing-draft", 20, 60_000)) return Response.json({ error: "Too many drafts, wait a moment." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { imageDataUrl?: unknown } | null;
  const checked = parseImageDataUrl(body?.imageDataUrl);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: checked.status });

  if (!hasVisionKey()) {
    return Response.json({ error: "No AI key is configured, so photo drafting is off. Fill the form in by hand." }, { status: 503 });
  }

  try {
    return Response.json({ draft: await draftFromPhoto(body!.imageDataUrl as string, env().CURRENCY) });
  } catch (e) {
    // Same reasoning as the negotiation path: a provider failure degrades to manual entry, never a 500.
    console.error("listing-draft failed", e);
    return Response.json({ error: "Could not read that photo. Fill the form in by hand, or try another picture." }, { status: 503 });
  }
}
