export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function fail(status: number, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json({ error: message, ...extra }, status, headers);
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return (xff.split(",")[0] ?? "").trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Perlindungan CSRF untuk permintaan yang mengubah data: Origin harus sama dengan host situs ini.
 * Klien non-browser (curl) harus mengirim header Origin yang cocok.
 */
export function sameOrigin(req: Request): boolean {
  const m = req.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  const origin = req.headers.get("origin");
  const hosts = [req.headers.get("x-forwarded-host"), req.headers.get("host")]
    .filter((h): h is string => !!h)
    .map((h) => (h.split(",")[0] ?? "").trim().toLowerCase());
  if (origin) {
    try {
      const o = new URL(origin);
      return hosts.includes(o.host.toLowerCase());
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return site === "same-origin";
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 200_000): Promise<T | null> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) return null;
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}
