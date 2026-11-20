import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userFromCookieHeader } from "./auth";
import { COOKIE } from "./session";
import type { User } from "./users";

// Untuk Server Component. Route handler memakai guard() di auth.ts.

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  return userFromCookieHeader(token ? `${COOKIE}=${encodeURIComponent(token)}` : "");
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/chat");
  return u;
}
