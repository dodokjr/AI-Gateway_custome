import { guard } from "@/lib/auth";
import { clientIp, fail, json } from "@/lib/http";
import { listProviders } from "@/lib/providers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const g = await guard(req);
  if (g.res) return g.res;
  const r = await listProviders(clientIp(req));
  if (r.error && r.list.length === 0) return fail(502, r.error);
  return json({ providers: r.list });
}
