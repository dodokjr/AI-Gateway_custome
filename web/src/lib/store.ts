import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";

// Penyimpanan kunci-nilai kecil untuk pengguna dan statistik.
// File lokal untuk satu server; Upstash Redis REST untuk serverless.

export interface Store {
  readonly kind: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  /** true bila kunci belum ada dan berhasil dibuat (atomik). */
  setnx(key: string, value: string): Promise<boolean>;
  del(key: string): Promise<void>;
  sadd(set: string, member: string): Promise<void>;
  srem(set: string, member: string): Promise<void>;
  smembers(set: string): Promise<string[]>;
}

type FileData = { kv: Record<string, string>; sets: Record<string, string[]> };

export class FileStore implements Store {
  readonly kind = "file";
  private data: FileData | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string) {}

  private async load(): Promise<FileData> {
    if (this.data) return this.data;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const p = JSON.parse(raw) as Partial<FileData>;
      this.data = { kv: p.kv ?? {}, sets: p.sets ?? {} };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        // berkas rusak: simpan salinan agar tidak hilang, lalu mulai kosong
        try {
          await fs.rename(this.file, this.file + ".corrupt-" + Date.now());
        } catch {
          /* abaikan */
        }
      }
      this.data = { kv: {}, sets: {} };
    }
    return this.data;
  }

  private async flush(): Promise<void> {
    const d = await this.load();
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(d), { mode: 0o600 });
    await fs.rename(tmp, this.file);
  }

  /** Serialkan semua operasi tulis agar tidak saling menimpa. */
  private run<T>(fn: (d: FileData) => T | Promise<T>, write: boolean): Promise<T> {
    const next = this.chain.then(async () => {
      const d = await this.load();
      const out = await fn(d);
      if (write) await this.flush();
      return out;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }

  get(key: string) {
    return this.run((d) => d.kv[key] ?? null, false);
  }
  async set(key: string, value: string) {
    await this.run((d) => void (d.kv[key] = value), true);
  }
  setnx(key: string, value: string) {
    return this.run((d) => {
      if (key in d.kv) return false;
      d.kv[key] = value;
      return true;
    }, true);
  }
  async del(key: string) {
    await this.run((d) => void delete d.kv[key], true);
  }
  async sadd(set: string, member: string) {
    await this.run((d) => {
      const s = (d.sets[set] ??= []);
      if (!s.includes(member)) s.push(member);
    }, true);
  }
  async srem(set: string, member: string) {
    await this.run((d) => {
      d.sets[set] = (d.sets[set] ?? []).filter((m) => m !== member);
    }, true);
  }
  smembers(set: string) {
    return this.run((d) => [...(d.sets[set] ?? [])], false);
  }
}

export class UpstashStore implements Store {
  readonly kind = "upstash";
  constructor(private readonly url: string, private readonly token: string) {}

  private async cmd(...args: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!res.ok || j.error) throw new Error("penyimpanan Upstash gagal: " + (j.error ?? res.status));
    return j.result;
  }

  async get(key: string) {
    const r = await this.cmd("GET", key);
    return typeof r === "string" ? r : null;
  }
  async set(key: string, value: string) {
    await this.cmd("SET", key, value);
  }
  async setnx(key: string, value: string) {
    return (await this.cmd("SET", key, value, "NX")) === "OK";
  }
  async del(key: string) {
    await this.cmd("DEL", key);
  }
  async sadd(set: string, member: string) {
    await this.cmd("SADD", set, member);
  }
  async srem(set: string, member: string) {
    await this.cmd("SREM", set, member);
  }
  async smembers(set: string) {
    const r = await this.cmd("SMEMBERS", set);
    return Array.isArray(r) ? (r as string[]) : [];
  }
}

const g = globalThis as unknown as { __aigwStore?: Store };

export function getStore(): Store {
  if (g.__aigwStore) return g.__aigwStore;
  let s: Store;
  if (env.upstashUrl && env.upstashToken) {
    s = new UpstashStore(env.upstashUrl, env.upstashToken);
  } else if (env.serverless) {
    throw new Error(
      "Di Vercel/Netlify penyimpanan lokal akan hilang. Isi UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN.",
    );
  } else {
    s = new FileStore(path.resolve(env.storePath));
  }
  g.__aigwStore = s;
  return s;
}

/** Hanya untuk pengujian. */
export function setStoreForTest(s: Store | null) {
  g.__aigwStore = s ?? undefined;
}
