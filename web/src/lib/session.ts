import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const COOKIE = "aigw_session";
export const SESSION_TTL_SEC = 7 * 24 * 3600;

type Payload = { uid: string; exp: number };

function mac(data: string): Buffer {
  return createHmac("sha256", env.sessionSecret).update(data).digest();
}

export function signSession(uid: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ uid, exp: Math.floor(now / 1000) + SESSION_TTL_SEC } satisfies Payload)).toString("base64url");
  return `${body}.${mac(body).toString("base64url")}`;
}

/** Mengembalikan uid bila tanda tangan sah dan belum kedaluwarsa. */
export function verifySession(token: string | undefined | null, now = Date.now()): string | null {
  if (!token || token.length > 1024) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = mac(body);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Payload>;
    if (typeof p.uid !== "string" || typeof p.exp !== "number") return null;
    if (p.exp * 1000 < now) return null;
    return p.uid;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string): string {
  const secure = env.production ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${secure}`;
}

export function clearCookie(): string {
  const secure = env.production ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
