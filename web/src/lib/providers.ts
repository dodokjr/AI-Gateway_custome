import { gw } from "./gateway";

export interface ProviderInfo {
  name: string;
  type: string;
  model: string;
  priority: number;
  available: boolean;
  /** Bisa memakai token pengguna sendiri (bukan Custom AI). */
  byok: boolean;
}

type RawStatus = {
  providers?: { name: string; type: string; model: string; priority: number; keys?: { available: boolean }[] }[];
};

const g = globalThis as unknown as { __aigwProv?: { at: number; list: ProviderInfo[] } };

export function mapProviders(raw: unknown): ProviderInfo[] {
  const list = (raw as RawStatus)?.providers ?? [];
  return list.map((p) => ({
    name: String(p.name),
    type: String(p.type),
    model: String(p.model ?? ""),
    priority: Number(p.priority ?? 0),
    available: !p.keys || p.keys.length === 0 || p.keys.some((k) => k.available),
    byok: p.type !== "custom",
  }));
}

/** Daftar AI untuk pemilih di chat. Tanpa kunci apa pun. Di-cache 10 detik. */
export async function listProviders(ip?: string): Promise<{ list: ProviderInfo[]; error?: string }> {
  const c = g.__aigwProv;
  if (c && Date.now() - c.at < 10_000) return { list: c.list };
  const r = await gw("/v1/status", { ip, timeoutMs: 10_000 });
  if (r.status !== 200) {
    const msg = (r.data as { error?: string })?.error ?? `HTTP ${r.status}`;
    return { list: c?.list ?? [], error: msg };
  }
  const list = mapProviders(r.data);
  g.__aigwProv = { at: Date.now(), list };
  return { list };
}

export function resetProviderCache() {
  g.__aigwProv = undefined;
}
