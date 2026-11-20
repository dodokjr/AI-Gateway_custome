import { guard } from "./auth";
import { errMsg, gw, gwRaw, redirectMsg } from "./gateway";
import { clientIp, fail, json, readJson } from "./http";

// Daftar putih rute gateway yang boleh diteruskan untuk admin. Selain ini ditolak.
interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE";
  pattern: RegExp;
  query?: string[];
  body?: boolean;
  raw?: boolean;
}

export const ROUTES: Route[] = [
  { method: "GET", pattern: /^status$/ },
  { method: "GET", pattern: /^selfcheck$/ },
  { method: "POST", pattern: /^selfheal$/ },
  { method: "GET", pattern: /^learn\/review$/, query: ["limit"] },
  { method: "POST", pattern: /^feedback$/, body: true },
  { method: "GET", pattern: /^train$/, query: ["q"] },
  { method: "POST", pattern: /^train$/, body: true },
  { method: "DELETE", pattern: /^train\/[A-Za-z0-9_-]{1,64}$/ },
  { method: "GET", pattern: /^persona$/ },
  { method: "PUT", pattern: /^persona$/, body: true },
  { method: "GET", pattern: /^training\/log$/, query: ["limit"] },
  { method: "DELETE", pattern: /^training\/log$/ },
  { method: "GET", pattern: /^training\/export$/, query: ["limit", "provider", "exclude_custom"], raw: true },
  { method: "POST", pattern: /^training\/replay$/, body: true },
];

export function matchRoute(method: string, segments: string[]): Route | null {
  if (segments.length === 0 || segments.some((s) => !s || s === "." || s === ".." || /[\\%?#]/.test(s))) return null;
  const p = segments.join("/");
  return ROUTES.find((r) => r.method === method.toUpperCase() && r.pattern.test(p)) ?? null;
}

export async function handleAdminGw(req: Request, segments: string[]): Promise<Response> {
  const g = await guard(req, { admin: true });
  if (g.res) return g.res;

  const route = matchRoute(req.method, segments);
  if (!route) return fail(404, "rute tidak diizinkan");

  const url = new URL(req.url);
  const query: Record<string, string> = {};
  for (const k of route.query ?? []) {
    const v = url.searchParams.get(k);
    if (v !== null && v.length <= 200) query[k] = v;
  }
  let body: unknown;
  if (route.body) {
    const b = await readJson(req, 200_000);
    if (!b) return fail(400, "body harus JSON");
    body = b;
  } else if (req.method !== "GET" && req.method !== "DELETE") {
    body = undefined;
  }

  const path = "/v1/" + segments.join("/");
  const ip = clientIp(req);

  if (route.raw) {
    const res = await gwRaw(path, { query, ip, timeoutMs: 60_000 });
    if (!res) return fail(502, "gateway tidak dapat dihubungi");
    if (res.status >= 300 && res.status < 400) return fail(502, redirectMsg(res));
    if (!res.ok) return fail(res.status === 401 ? 502 : res.status, errMsg(await res.json().catch(() => ({})), "ekspor gagal"));
    const h: Record<string, string> = {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="training.jsonl"',
      "Cache-Control": "no-store",
    };
    const n = res.headers.get("x-records");
    if (n) h["X-Records"] = n;
    return new Response(res.body, { status: 200, headers: h });
  }

  const r = await gw(path, { method: route.method, query, body, ip, timeoutMs: 60_000 });
  return json(r.data, r.status);
}