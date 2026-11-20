// Riwayat percakapan disimpan di browser (per akun). Tidak ada salinan di server.

export interface CouncilData {
  custom?: { text: string; secondary?: string };
  custom_declined?: string;
  opinions: { provider: string; model: string; answer?: string; verdict?: string; reason?: string; error?: string }[];
  summary: { verdict: string; note?: string; responded: number };
}

export interface ChatMeta {
  provider?: string;
  model?: string;
  byok?: boolean;
  failed?: { provider: string; error: string }[];
  knowledge?: { id: string; question: string }[];
  secondary?: string;
  council?: CouncilData;
}

export interface StoredMsg {
  role: "user" | "assistant";
  content: string;
  meta?: ChatMeta;
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMsg[];
}

const MAX_CONVS = 50;
const MAX_MSGS = 200;
const key = (uid: string) => `aigw:chats:${uid}`;

export function loadChats(uid: string): Conversation[] {
  try {
    const raw = window.localStorage.getItem(key(uid));
    const v = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveChats(uid: string, convs: Conversation[]) {
  const trimmed = [...convs]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVS)
    .map((c) => ({ ...c, messages: c.messages.slice(-MAX_MSGS) }));
  try {
    window.localStorage.setItem(key(uid), JSON.stringify(trimmed));
  } catch {
    /* penuh: coba simpan setengah terbaru */
    try {
      window.localStorage.setItem(key(uid), JSON.stringify(trimmed.slice(0, Math.ceil(trimmed.length / 2))));
    } catch {
      /* abaikan */
    }
  }
}

export function clearChats(uid: string) {
  try {
    window.localStorage.removeItem(key(uid));
  } catch {
    /* abaikan */
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 48 ? t.slice(0, 47) + "…" : t || "Obrolan baru";
}

const prefKey = (uid: string) => `aigw:prefs:${uid}`;

export interface Prefs {
  target: string; // "auto" | "council" | nama provider
  useOwnToken: boolean;
  model: string;
}

export function loadPrefs(uid: string): Prefs {
  try {
    const raw = window.localStorage.getItem(prefKey(uid));
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return { target: p.target || "auto", useOwnToken: p.useOwnToken !== false, model: p.model || "" };
  } catch {
    return { target: "auto", useOwnToken: true, model: "" };
  }
}

export function savePrefs(uid: string, p: Prefs) {
  try {
    window.localStorage.setItem(prefKey(uid), JSON.stringify(p));
  } catch {
    /* abaikan */
  }
}
