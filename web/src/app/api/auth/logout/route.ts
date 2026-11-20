import { fail, json, sameOrigin } from "@/lib/http";
import { clearCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "asal permintaan tidak diizinkan");
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
}
