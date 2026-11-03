import { COOKIE, passwordOk, sessionValue } from "../../../../lib/auth";
import { allow, clientIp } from "../../../../lib/ratelimit";

export async function POST(req: Request) {
  if (!allow(`login:${clientIp(req)}`, 10, 60_000)) return Response.json({ error: "rate limited" }, { status: 429 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !passwordOk(password)) return Response.json({ error: "wrong password" }, { status: 401 });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": `${COOKIE}=${sessionValue()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}` },
  });
}
