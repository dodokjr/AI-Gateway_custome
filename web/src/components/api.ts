// Pembantu fetch untuk komponen klien. Semua panggilan ke API milik aplikasi ini (same-origin).

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

export async function api<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
    });
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text.slice(0, 200) };
    }
    const err = (data as { error?: unknown }).error;
    return { ok: res.ok, status: res.status, data: data as T, error: res.ok ? undefined : typeof err === "string" ? err : `HTTP ${res.status}` };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, status: 0, data: {} as T, error: "dibatalkan" };
    return { ok: false, status: 0, data: {} as T, error: "tidak dapat terhubung ke server" };
  }
}
