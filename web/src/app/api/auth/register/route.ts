import { env } from "@/lib/env";
import { clientIp, fail, json, readJson, sameOrigin } from "@/lib/http";
import { hit } from "@/lib/ratelimit";
import { sessionCookie, signSession } from "@/lib/session";
import { createUser, toPublic, UserError } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "asal permintaan tidak diizinkan");
  if (!env.allowSignup) return fail(403, "pendaftaran ditutup; hubungi admin");
  const rl = hit("register:" + clientIp(req), 5, 60 * 60_000);
  if (!rl.ok) return fail(429, "terlalu banyak pendaftaran dari alamat ini", {}, { "Retry-After": String(rl.retryAfter) });
  const body = await readJson(req, 4_000);
  if (!body) return fail(400, "body harus JSON");
  try {
    // peran selalu "user": admin hanya dari ADMIN_EMAIL atau diubah admin lain
    const user = await createUser({ email: body.email, name: body.name, password: body.password, role: "user" });
    return json({ user: toPublic(user) }, 201, { "Set-Cookie": sessionCookie(signSession(user.id)) });
  } catch (e) {
    if (e instanceof UserError) return fail(e.status, e.message);
    throw e;
  }
}
