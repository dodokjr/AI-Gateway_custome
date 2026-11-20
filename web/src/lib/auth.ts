import { fail, sameOrigin } from "./http";
import { COOKIE, parseCookies, verifySession } from "./session";
import { findById, type User } from "./users";

export async function userFromCookieHeader(header: string | null | undefined): Promise<User | null> {
  let token: string | undefined;
  try {
    token = parseCookies(header)[COOKIE];
  } catch {
    return null;
  }
  const uid = verifySession(token);
  if (!uid) return null;
  const u = await findById(uid);
  // peran dan status dibaca ulang dari penyimpanan: pencabutan akses langsung berlaku
  if (!u || u.disabled) return null;
  return u;
}

export function userFromRequest(req: Request) {
  return userFromCookieHeader(req.headers.get("cookie"));
}

export type Guarded = { user: User; res?: undefined } | { user?: undefined; res: Response };

/** Pagar untuk route handler: asal permintaan (CSRF), sesi, dan peran. */
export async function guard(req: Request, opts: { admin?: boolean } = {}): Promise<Guarded> {
  if (!sameOrigin(req)) return { res: fail(403, "asal permintaan tidak diizinkan") };
  const user = await userFromRequest(req);
  if (!user) return { res: fail(401, "belum login") };
  if (opts.admin && user.role !== "admin") return { res: fail(403, "khusus admin") };
  return { user };
}
