import { getStore } from "./store";

export interface Usage {
  messages: number;
  byok: number;
  council: number;
  byProvider: Record<string, number>;
  lastAt?: string;
  firstAt?: string;
}

const empty = (): Usage => ({ messages: 0, byok: 0, council: 0, byProvider: {} });
const key = (uid: string) => `usage:${uid}`;

export async function getUsage(uid: string): Promise<Usage> {
  const raw = await getStore().get(key(uid));
  if (!raw) return empty();
  try {
    return { ...empty(), ...(JSON.parse(raw) as Partial<Usage>) };
  } catch {
    return empty();
  }
}

/** Baca-ubah-tulis sederhana; hitungan bisa meleset sedikit saat permintaan bersamaan (bukan data penagihan). */
export async function recordUsage(uid: string, e: { provider: string; byok: boolean; council: boolean }): Promise<void> {
  const u = await getUsage(uid);
  u.messages += 1;
  if (e.byok) u.byok += 1;
  if (e.council) u.council += 1;
  u.byProvider[e.provider] = (u.byProvider[e.provider] ?? 0) + 1;
  const now = new Date().toISOString();
  u.lastAt = now;
  u.firstAt ??= now;
  await getStore().set(key(uid), JSON.stringify(u));
}
