import { guard } from "@/lib/auth";
import { json } from "@/lib/http";
import { getUsage } from "@/lib/usage";
import { toPublic } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const g = await guard(req);
  if (g.res) return g.res;
  return json({ user: toPublic(g.user), usage: await getUsage(g.user.id) });
}
