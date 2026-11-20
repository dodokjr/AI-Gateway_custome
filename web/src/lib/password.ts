import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

function derive(pw: string, salt: Buffer, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pw, salt, KEYLEN, { N: n, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Format: s1$N$salt$hash (base64url). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pw, salt, N);
  return `s1$${N}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "s1") return false;
  const n = Number(parts[1]);
  if (!Number.isInteger(n) || n < 4096 || n > 1 << 20) return false;
  const salt = Buffer.from(parts[2] ?? "", "base64url");
  const want = Buffer.from(parts[3] ?? "", "base64url");
  if (salt.length < 8 || want.length !== KEYLEN) return false;
  const got = await derive(pw, salt, n);
  return timingSafeEqual(got, want);
}

let dummy: Promise<string> | null = null;

/** Hash palsu agar waktu respons tidak membocorkan apakah email terdaftar. */
export function burnPasswordCheck(pw: string): Promise<boolean> {
  dummy ??= hashPassword("tidak-pernah-cocok-" + randomBytes(8).toString("hex"));
  return dummy.then((h) => verifyPassword(pw, h));
}

export function passwordProblem(pw: string): string | null {
  if (typeof pw !== "string") return "sandi tidak valid";
  if (pw.length < 10) return "sandi minimal 10 karakter";
  if (pw.length > 200) return "sandi terlalu panjang";
  if (/^(.)\1+$/.test(pw)) return "sandi terlalu mudah ditebak";
  return null;
}
