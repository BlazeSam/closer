import { negotiateHandler } from "../../../../lib/turnRoute";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return negotiateHandler(req, (await params).slug, "HUMAN");
}
