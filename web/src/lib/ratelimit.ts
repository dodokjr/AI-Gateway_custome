// Pembatas laju dalam memori (per proses). Di serverless tiap instans punya hitungan sendiri,
// jadi ini pengaman tambahan; batas utama tetap di gateway Go.

const g = globalThis as unknown as { __aigwRL?: Map<string, number[]> };
const buckets = (g.__aigwRL ??= new Map<string, number[]>());

export function hit(key: string, limit: number, windowMs: number, cost = 1, now = Date.now()): { ok: boolean; retryAfter: number } {
  const cut = now - windowMs;
  const arr = (buckets.get(key) ?? []).filter((t) => t > cut);
  if (arr.length + cost > limit) {
    buckets.set(key, arr);
    const oldest = arr[0] ?? now;
    return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  for (let i = 0; i < cost; i++) arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some((t) => t > cut)) buckets.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

const FAIL_LIMIT = 8;
const FAIL_WINDOW = 10 * 60_000;

/** Pembatas percobaan login: hitung hanya kegagalan. */
export const loginFails = {
  blocked(key: string, now = Date.now()): number {
    const arr = (buckets.get("fail:" + key) ?? []).filter((t) => t > now - FAIL_WINDOW);
    if (arr.length < FAIL_LIMIT) return 0;
    return Math.max(1, Math.ceil(((arr[0] ?? now) + FAIL_WINDOW - now) / 1000));
  },
  fail(key: string, now = Date.now()) {
    const k = "fail:" + key;
    const arr = (buckets.get(k) ?? []).filter((t) => t > now - FAIL_WINDOW);
    arr.push(now);
    buckets.set(k, arr);
  },
  clear(key: string) {
    buckets.delete("fail:" + key);
  },
};
