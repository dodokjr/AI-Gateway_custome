// Pembacaan environment. Semua rahasia hanya ada di sisi server.

function num(v: string | undefined, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return def;
  return Math.floor(n);
}

export const env = {
  get gatewayUrl(): string {
    return (process.env.GATEWAY_URL || "http://localhost:8080").replace(/\/+$/, "");
  },
  get gatewayKey(): string {
    return process.env.GATEWAY_KEY || "";
  },
  get sessionSecret(): string {
    const s = process.env.SESSION_SECRET || "";
    if (s.length < 32) {
      throw new Error("SESSION_SECRET wajib diisi (minimal 32 karakter). Buat dengan: openssl rand -base64 48");
    }
    return s;
  },
  get adminEmail(): string {
    return (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  },
  get adminPassword(): string {
    return process.env.ADMIN_PASSWORD || "";
  },
  get allowSignup(): boolean {
    return (process.env.ALLOW_SIGNUP ?? "1") !== "0";
  },
  get chatPerMin(): number {
    return num(process.env.RATE_LIMIT_CHAT_PER_MIN, 20, 1, 1000);
  },
  get upstashUrl(): string {
    return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  },
  get upstashToken(): string {
    return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  },
  get storePath(): string {
    return process.env.STORE_PATH || ".data/store.json";
  },
  get forwardClientIp(): boolean {
    return process.env.FORWARD_CLIENT_IP === "1";
  },
  get serverless(): boolean {
    return !!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
  },
  get production(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
