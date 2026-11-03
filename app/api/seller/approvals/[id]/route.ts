import { z } from "zod";
import { isSeller, unauthorized } from "../../../../../lib/auth";
import { resolveApproval } from "../../../../../lib/negotiation";

const body = z.object({ approve: z.boolean(), reply: z.string().max(500).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSeller(req)) return unauthorized();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const result = await resolveApproval((await params).id, parsed.data.approve, parsed.data.reply);
  return Response.json({ result });
}
