import { clientIp, fail, json, readJson, sameOrigin } from "@/lib/http";
import { loginFails } from "@/lib/ratelimit";
import { sessionCookie, signSession } from "@/lib/session";
import { ensureAdminSeed, normEmail, toPublic, verifyLogin } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "asal permintaan tidak diizinkan");
  const body = await readJson(req, 4_000);
  if (!body) return fail(400, "body harus JSON");

  const ipKey = "ip:" + clientIp(req);
  const emailKey = "em:" + normEmail(body.email);
  const wait = Math.max(loginFails.blocked(ipKey), loginFails.blocked(emailKey));
  if (wait > 0) return fail(429, "terlalu banyak percobaan gagal, coba lagi nanti", {}, { "Retry-After": String(wait) });

  await ensureAdminSeed();
  const user = await verifyLogin(body.email, body.password);
  if (!user) {
    loginFails.fail(ipKey);
    loginFails.fail(emailKey);
    return fail(401, "email atau sandi salah");
  }
  loginFails.clear(emailKey);
  return json({ user: toPublic(user) }, 200, { "Set-Cookie": sessionCookie(signSession(user.id)) });
}
