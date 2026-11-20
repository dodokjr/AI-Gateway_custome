import { guard } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { getUsage } from "@/lib/usage";
import { createUser, deleteUser, listUsers, toPublic, updateUser, UserError, type Role } from "@/lib/users";

export const runtime = "nodejs";

function wrap(e: unknown): Response {
  if (e instanceof UserError) return fail(e.status, e.message);
  throw e;
}

export async function GET(req: Request) {
  const g = await guard(req, { admin: true });
  if (g.res) return g.res;
  const users = await listUsers();
  const rows = await Promise.all(users.map(async (u) => ({ ...toPublic(u), usage: await getUsage(u.id) })));
  return json({ users: rows });
}

export async function POST(req: Request) {
  const g = await guard(req, { admin: true });
  if (g.res) return g.res;
  const b = await readJson(req, 4_000);
  if (!b) return fail(400, "body harus JSON");
  try {
    const u = await createUser({ email: b.email, name: b.name, password: b.password, role: b.role === "admin" ? "admin" : "user" });
    return json({ user: toPublic(u) }, 201);
  } catch (e) {
    return wrap(e);
  }
}

export async function PATCH(req: Request) {
  const g = await guard(req, { admin: true });
  if (g.res) return g.res;
  const b = await readJson(req, 4_000);
  if (!b || typeof b.id !== "string") return fail(400, "id wajib");
  if (b.id === g.user.id && (b.role === "user" || b.disabled === true)) {
    return fail(409, "tidak bisa menurunkan atau menonaktifkan akun sendiri");
  }
  try {
    const role = b.role === "admin" || b.role === "user" ? (b.role as Role) : undefined;
    const u = await updateUser(b.id, {
      role,
      disabled: typeof b.disabled === "boolean" ? b.disabled : undefined,
      name: typeof b.name === "string" ? b.name : undefined,
      password: typeof b.password === "string" ? b.password : undefined,
    });
    return json({ user: toPublic(u) });
  } catch (e) {
    return wrap(e);
  }
}

export async function DELETE(req: Request) {
  const g = await guard(req, { admin: true });
  if (g.res) return g.res;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return fail(400, "id wajib");
  if (id === g.user.id) return fail(409, "tidak bisa menghapus akun sendiri");
  try {
    await deleteUser(id);
    return json({ deleted: true });
  } catch (e) {
    return wrap(e);
  }
}
