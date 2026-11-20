import { env } from "./env";

export interface GwResult {
  status: number;
  data: unknown;
}

type Opts = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  ip?: string;
  timeoutMs?: number;
};

function build(path: string, o: Opts): { url: string; init: RequestInit } {
  const u = new URL(env.gatewayUrl + path);
  for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  const headers: Record<string, string> = {};
  if (env.gatewayKey) headers["Authorization"] = `Bearer ${env.gatewayKey}`;
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  if (env.forwardClientIp && o.ip && o.ip !== "unknown") headers["X-Forwarded-For"] = o.ip;
  return {
    url: u.toString(),
    init: {
      method: o.method ?? "GET",
      headers,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      cache: "no-store",
      // jangan ikuti pengalihan: kunci gateway tidak boleh terbawa ke host lain, dan
      // pengalihan ke halaman login (mis. alamat preview workspace) harus terlihat sebagai galat
      redirect: "manual",
      signal: AbortSignal.timeout(o.timeoutMs ?? 70_000),
    },
  };
}

/** Panggil gateway Go dan kembalikan JSON. Galat jaringan diubah menjadi 502. */
export async function gw(path: string, o: Opts = {}): Promise<GwResult> {
  const { url, init } = build(path, o);
  try {
    const res = await fetch(url, init);
    if (res.status >= 300 && res.status < 400) return { status: 502, data: { error: redirectMsg(res) } };
    const text = await res.text();
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (text.trim() && !ctype.includes("json")) {
      return { status: 502, data: { error: notJsonMsg(text, ctype) } };
    }
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text.slice(0, 300) || `HTTP ${res.status}` };
    }
    // 401 dari gateway = kunci server salah; jangan teruskan sebagai "belum login"
    if (res.status === 401) return { status: 502, data: { error: "kunci gateway di server frontend salah (GATEWAY_KEY)" } };
    return { status: res.status, data };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { status: timeout ? 504 : 502, data: { error: timeout ? "gateway terlalu lama menjawab" : "gateway tidak dapat dihubungi" } };
  }
}

function hostOf(loc: string | null): string {
  try {
    return loc ? new URL(loc, env.gatewayUrl).host : "?";
  } catch {
    return "?";
  }
}

export function redirectMsg(res: Response): string {
  return `gateway mengalihkan permintaan ke ${hostOf(res.headers.get("location"))}. Periksa GATEWAY_URL: harus alamat gateway Go yang bisa dijangkau server ini (mis. http://localhost:8080), bukan alamat preview yang meminta login.`;
}

export function notJsonMsg(text: string, ctype: string): string {
  const looksHtml = ctype.includes("html") || /^\s*<(!doctype|html)/i.test(text);
  return looksHtml
    ? "GATEWAY_URL mengembalikan halaman HTML, bukan JSON dari gateway. Periksa alamatnya (mungkin halaman login atau alamat yang salah)."
    : "gateway mengembalikan respons yang bukan JSON.";
}

/** Untuk respons non-JSON (ekspor JSONL). Mengembalikan Response mentah atau null bila gagal. */
export async function gwRaw(path: string, o: Opts = {}): Promise<Response | null> {
  const { url, init } = build(path, o);
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
}

export function errMsg(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
    return (data as { error: string }).error;
  }
  return fallback;
}