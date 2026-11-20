import { randomBytes } from "node:crypto";
import { env } from "./env";
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from "./password";
import { getStore } from "./store";

export type Role = "admin" | "user";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  hash: string;
  createdAt: string;
  lastLoginAt?: string;
}

export type PublicUser = Omit<User, "hash">;

export class UserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normEmail(e: unknown): string {
  return typeof e === "string" ? e.trim().toLowerCase() : "";
}

export function cleanName(n: unknown, fallback: string): string {
  const s = typeof n === "string" ? n.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 60) : "";
  return s || fallback;
}

export function toPublic(u: User): PublicUser {
  const { hash: _hash, ...rest } = u;
  void _hash;
  return rest;
}

const USERS = "users";
const userKey = (id: string) => `user:${id}`;
const emailKey = (e: string) => `email:${e}`;

export async function findById(id: string): Promise<User | null> {
  const raw = await getStore().get(userKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function findByEmail(email: string): Promise<User | null> {
  const id = await getStore().get(emailKey(normEmail(email)));
  return id ? findById(id) : null;
}

export async function listUsers(): Promise<User[]> {
  const ids = await getStore().smembers(USERS);
  const all = await Promise.all(ids.map(findById));
  return all.filter((u): u is User => !!u).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createUser(input: { email: unknown; name?: unknown; password: unknown; role?: Role }): Promise<User> {
  const email = normEmail(input.email);
  if (!EMAIL_RE.test(email) || email.length > 254) throw new UserError("email tidak valid");
  const pwProblem = passwordProblem(input.password as string);
  if (pwProblem) throw new UserError(pwProblem);
  const id = randomBytes(9).toString("base64url");
  const store = getStore();
  // klaim email secara atomik agar tidak ada dua akun dengan email sama
  if (!(await store.setnx(emailKey(email), id))) throw new UserError("email sudah terdaftar", 409);
  const user: User = {
    id,
    email,
    name: cleanName(input.name, email.split("@")[0] ?? "pengguna"),
    role: input.role === "admin" ? "admin" : "user",
    disabled: false,
    hash: await hashPassword(input.password as string),
    createdAt: new Date().toISOString(),
  };
  await store.set(userKey(id), JSON.stringify(user));
  await store.sadd(USERS, id);
  return user;
}

async function save(u: User) {
  await getStore().set(userKey(u.id), JSON.stringify(u));
}

export async function activeAdminCount(): Promise<number> {
  return (await listUsers()).filter((u) => u.role === "admin" && !u.disabled).length;
}

export async function updateUser(
  id: string,
  patch: { role?: Role; disabled?: boolean; name?: string; password?: string },
): Promise<User> {
  const u = await findById(id);
  if (!u) throw new UserError("pengguna tidak ditemukan", 404);
  const losesAdmin =
    u.role === "admin" && !u.disabled && (patch.role === "user" || patch.disabled === true);
  if (losesAdmin && (await activeAdminCount()) <= 1) {
    throw new UserError("harus ada minimal satu admin aktif", 409);
  }
  if (patch.role) u.role = patch.role === "admin" ? "admin" : "user";
  if (typeof patch.disabled === "boolean") u.disabled = patch.disabled;
  if (typeof patch.name === "string") u.name = cleanName(patch.name, u.name);
  if (patch.password !== undefined) {
    const p = passwordProblem(patch.password);
    if (p) throw new UserError(p);
    u.hash = await hashPassword(patch.password);
  }
  await save(u);
  return u;
}

export async function deleteUser(id: string): Promise<void> {
  const u = await findById(id);
  if (!u) throw new UserError("pengguna tidak ditemukan", 404);
  if (u.role === "admin" && !u.disabled && (await activeAdminCount()) <= 1) {
    throw new UserError("harus ada minimal satu admin aktif", 409);
  }
  const s = getStore();
  await s.del(userKey(id));
  await s.del(emailKey(u.email));
  await s.del(`usage:${id}`);
  await s.srem(USERS, id);
}

/** Membuat admin pertama dari ADMIN_EMAIL/ADMIN_PASSWORD bila belum ada. Tidak pernah menimpa. */
export async function ensureAdminSeed(): Promise<void> {
  const email = env.adminEmail;
  const pw = env.adminPassword;
  if (!email || !pw) return;
  if (await findByEmail(email)) return;
  try {
    await createUser({ email, name: "Admin", password: pw, role: "admin" });
  } catch (e) {
    if (!(e instanceof UserError)) throw e; // sandi lemah/email salah: abaikan, admin tidak dibuat
  }
}

/** Cek email+sandi. Mengembalikan pengguna bila sah, null bila tidak (waktu respons dibuat seragam). */
export async function verifyLogin(emailIn: unknown, password: unknown): Promise<User | null> {
  const email = normEmail(emailIn);
  const pw = typeof password === "string" ? password.slice(0, 200) : "";
  const u = email ? await findByEmail(email) : null;
  if (!u) {
    await burnPasswordCheck(pw);
    return null;
  }
  const ok = await verifyPassword(pw, u.hash);
  if (!ok || u.disabled) return null;
  u.lastLoginAt = new Date().toISOString();
  await save(u);
  return u;
}
