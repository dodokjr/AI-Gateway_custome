import { guard } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { hit } from "@/lib/ratelimit";
import { updateUser, UserError, verifyLogin } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const g = await guard(req);
  if (g.res) return g.res;
  const rl = hit("pw:" + g.user.id, 5, 10 * 60_000);
  if (!rl.ok) return fail(429, "terlalu banyak percobaan", {}, { "Retry-After": String(rl.retryAfter) });
  const body = await readJson(req, 4_000);
  if (!body) return fail(400, "body harus JSON");
  if (!(await verifyLogin(g.user.email, body.current))) return fail(401, "sandi saat ini salah");
  try {
    await updateUser(g.user.id, { password: String(body.next ?? "") });
  } catch (e) {
    if (e instanceof UserError) return fail(e.status, e.message);
    throw e;
  }
  return json({ ok: true });
}
