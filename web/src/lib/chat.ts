import { guard } from "./auth";
import { env } from "./env";
import { errMsg, gw } from "./gateway";
import { clientIp, fail, json, readJson } from "./http";
import { listProviders } from "./providers";
import { hit } from "./ratelimit";
import { recordUsage } from "./usage";

export type ChatMode = "auto" | "provider" | "council";

export interface Msg {
  role: "user" | "assistant";
  content: string;
}

const MAX_MSGS = 40;
const MAX_MSG_LEN = 8000;
const MAX_TOTAL = 60_000;
const MODEL_RE = /^[A-Za-z0-9._:/-]{1,100}$/;
// token API: tanpa spasi dan karakter kontrol
const KEY_RE = /^[\x21-\x7e]{8,512}$/;

export function cleanMessages(raw: unknown): Msg[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "messages kosong";
  const out: Msg[] = [];
  let total = 0;
  for (const m of raw.slice(-MAX_MSGS)) {
    if (!m || typeof m !== "object") return "format pesan salah";
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return "peran pesan harus user atau assistant";
    if (typeof content !== "string") return "isi pesan harus teks";
    const c = content.trim();
    if (!c) continue;
    if (c.length > MAX_MSG_LEN) return `satu pesan maksimal ${MAX_MSG_LEN} karakter`;
    total += c.length;
    out.push({ role, content: c });
  }
  if (total > MAX_TOTAL) return "percakapan terlalu panjang; mulai obrolan baru";
  if (out.length === 0 || out[out.length - 1]?.role !== "user") return "pesan terakhir harus dari pengguna";
  return out;
}

export async function handleChat(req: Request): Promise<Response> {
  const g = await guard(req);
  if (g.res) return g.res;
  const user = g.user;

  const body = await readJson(req, 400_000);
  if (!body) return fail(400, "body harus JSON");

  const msgs = cleanMessages(body.messages);
  if (typeof msgs === "string") return fail(400, msgs);

  const mode: ChatMode = body.mode === "council" ? "council" : body.provider ? "provider" : "auto";
  const rl = hit(`chat:${user.id}`, env.chatPerMin, 60_000, mode === "council" ? 3 : 1);
  if (!rl.ok) return fail(429, "terlalu banyak pesan, coba lagi sebentar", {}, { "Retry-After": String(rl.retryAfter) });

  const ip = clientIp(req);
  const provs = await listProviders(ip);
  let provider: string | undefined;
  let userKey: string | undefined;
  let model: string | undefined;

  if (mode === "provider") {
    if (typeof body.provider !== "string" || body.provider.length > 40) return fail(400, "provider tidak valid");
    if (provs.error && provs.list.length === 0) return fail(502, provs.error);
    const found = provs.list.find((p) => p.name.toLowerCase() === (body.provider as string).toLowerCase());
    if (!found) return fail(400, "provider tidak dikenal");
    provider = found.name;

    if (body.userKey !== undefined && body.userKey !== null && body.userKey !== "") {
      if (typeof body.userKey !== "string" || !KEY_RE.test(body.userKey)) return fail(400, "format token tidak valid");
      if (!found.byok) return fail(400, "AI ini tidak memakai token pengguna");
      userKey = body.userKey;
    }
    if (body.model !== undefined && body.model !== "") {
      if (typeof body.model !== "string" || !MODEL_RE.test(body.model)) return fail(400, "nama model tidak valid");
      // mengganti model memakai kuota pemilik server: hanya untuk token sendiri atau admin
      if (!userKey && user.role !== "admin") return fail(403, "mengganti model hanya untuk token sendiri");
      model = body.model;
    }
  } else if (body.userKey) {
    return fail(400, "token pengguna membutuhkan pilihan AI tertentu");
  }

  if (mode === "council") {
    const reviewers = Math.min(5, Math.max(1, Math.floor(Number(body.reviewers) || 2)));
    const r = await gw("/v1/council", { method: "POST", body: { messages: msgs, reviewers }, ip, timeoutMs: 120_000 });
    if (r.status !== 200) return fail(r.status, errMsg(r.data, "dewan gagal"), pickAttempts(r.data));
    await recordUsage(user.id, { provider: "dewan", byok: false, council: true });
    return json({ kind: "council", ...(r.data as object) });
  }

  const payload: Record<string, unknown> = { messages: msgs };
  if (provider) {
    payload.provider = provider;
    payload.strict = true;
    if (model) payload.model = model;
    if (userKey) payload.user_key = userKey;
  }
  const r = await gw("/v1/chat", { method: "POST", body: payload, ip });
  if (r.status !== 200) return fail(r.status, errMsg(r.data, "gagal"), pickAttempts(r.data));

  const d = r.data as {
    text?: string; provider?: string; model?: string; failed_attempts?: unknown[];
    knowledge_used?: unknown[]; secondary?: string; meta?: unknown; byok?: boolean;
  };
  await recordUsage(user.id, { provider: d.provider ?? provider ?? "auto", byok: !!userKey, council: false });
  return json({
    kind: "chat",
    text: d.text ?? "",
    provider: d.provider,
    model: d.model,
    failed: d.failed_attempts ?? [],
    knowledge: d.knowledge_used ?? [],
    secondary: d.secondary,
    meta: d.meta,
    byok: !!userKey,
  });
}

function pickAttempts(data: unknown): Record<string, unknown> {
  const a = (data as { attempts?: unknown })?.attempts;
  return Array.isArray(a) ? { attempts: a } : {};
}
