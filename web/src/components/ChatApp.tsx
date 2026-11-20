"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProviderInfo } from "@/lib/providers";
import { api } from "./api";
import {
  type ChatMeta,
  type CouncilData,
  type Conversation,
  type Prefs,
  type StoredMsg,
  loadChats,
  loadPrefs,
  newId,
  saveChats,
  savePrefs,
  titleFrom,
} from "./chatstore";
import Markdown from "./Markdown";
import { loadTokens, maskToken, saveToken, tokenFormatProblem, type TokenMap } from "./vault";

const VERDICT_LABEL: Record<string, { text: string; cls: string }> = {
  didukung: { text: "Jawaban Custom AI didukung", cls: "ok" },
  ditolak: { text: "Jawaban Custom AI ditolak", cls: "bad" },
  campuran: { text: "Pendapat campuran", cls: "warn" },
  "custom-tidak-menjawab": { text: "Custom AI belum punya jawaban", cls: "" },
  "tidak-terbaca": { text: "Penilaian tidak terbaca", cls: "" },
  "tidak-ada-peninjau": { text: "Tidak ada peninjau", cls: "warn" },
};
const OP_CLASS: Record<string, string> = { BENAR: "ok", SEBAGIAN: "warn", SALAH: "bad" };

function councilText(c: CouncilData): string {
  if (c.custom?.text) return c.custom.text;
  return c.opinions.find((o) => o.answer)?.answer ?? "";
}

function CouncilView({ c }: { c: CouncilData }) {
  const v = VERDICT_LABEL[c.summary.verdict] ?? { text: c.summary.verdict, cls: "" };
  return (
    <div className="council">
      <div className="row">
        <span className={`badge ${v.cls}`}>{v.text}</span>
        <span className="muted small">{c.summary.responded} AI menjawab</span>
      </div>
      {c.custom?.text ? (
        <div>
          <div className="muted small">Jawaban Custom AI</div>
          <Markdown text={c.custom.text} />
        </div>
      ) : (
        <div className="muted small">{c.custom_declined ?? "Custom AI tidak menjawab."}</div>
      )}
      {c.opinions.map((o, i) => (
        <div className="op" key={i}>
          <div className="row">
            <strong>{o.provider}</strong>
            <span className="muted small">{o.model}</span>
            {o.verdict ? <span className={`badge ${OP_CLASS[o.verdict] ?? ""}`}>{o.verdict}</span> : null}
          </div>
          {o.error ? <div className="small" style={{ color: "var(--danger)" }}>{o.error.slice(0, 200)}</div> : null}
          {o.answer ? <Markdown text={o.answer} /> : null}
          {o.reason ? <div className="muted small">Alasan: {o.reason}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Bubble({ m }: { m: StoredMsg }) {
  if (m.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble">{m.content}</div>
      </div>
    );
  }
  const meta = m.meta;
  return (
    <div className="msg assistant">
      <div className="bubble">
        {m.error ? (
          <div className="alert err" style={{ margin: 0 }} role="alert">
            {m.content}
          </div>
        ) : meta?.council ? (
          <CouncilView c={meta.council} />
        ) : (
          <Markdown text={m.content} />
        )}
      </div>
      {meta && !m.error ? (
        <div className="meta">
          {meta.provider ? (
            <span className="badge">
              {meta.provider}
              {meta.model ? ` · ${meta.model}` : ""}
            </span>
          ) : null}
          {meta.byok ? <span className="badge accent">token saya</span> : null}
          {meta.failed && meta.failed.length > 0 ? (
            <span className="badge warn" title={meta.failed.map((f) => `${f.provider}: ${f.error}`).join("\n")}>
              dialihkan dari {meta.failed.map((f) => f.provider).join(", ")}
            </span>
          ) : null}
          {meta.knowledge && meta.knowledge.length > 0 ? <span className="badge">memakai {meta.knowledge.length} pengetahuan terlatih</span> : null}
        </div>
      ) : null}
      {meta?.secondary ? (
        <details className="small" style={{ maxWidth: "100%" }}>
          <summary className="muted">Referensi tambahan</summary>
          <Markdown text={meta.secondary} />
        </details>
      ) : null}
    </div>
  );
}

type ChatReply = {
  kind: "chat";
  text: string;
  provider?: string;
  model?: string;
  failed?: { provider: string; error: string }[];
  knowledge?: { id: string; question: string }[];
  secondary?: string;
  byok?: boolean;
};
type CouncilReply = CouncilData & { kind: "council" };

export default function ChatApp({ uid, role }: { uid: string; role: "admin" | "user" }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provError, setProvError] = useState("");
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ target: "auto", useOwnToken: true, model: "" });
  const [tokens, setTokens] = useState<TokenMap>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteVal, setPasteVal] = useState("");
  const [pasteRemember, setPasteRemember] = useState(false);
  const [pasteErr, setPasteErr] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // muat data browser + daftar AI
  useEffect(() => {
    const cs = loadChats(uid).sort((a, b) => b.updatedAt - a.updatedAt);
    setConvs(cs);
    setActiveId(cs[0]?.id ?? "");
    setPrefs(loadPrefs(uid));
    setTokens(loadTokens(uid));
    setLoaded(true);
    api<{ providers: ProviderInfo[] }>("/api/providers").then((r) => {
      if (r.status === 401) window.location.href = "/login";
      else if (r.ok) setProviders(r.data.providers);
      else setProvError(r.error ?? "gagal memuat daftar AI");
    });
  }, [uid]);

  useEffect(() => {
    if (loaded) saveChats(uid, convs);
  }, [convs, loaded, uid]);
  useEffect(() => {
    if (loaded) savePrefs(uid, prefs);
  }, [prefs, loaded, uid]);

  const active = useMemo(() => convs.find((c) => c.id === activeId) ?? null, [convs, activeId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages.length, sending]);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  // pilihan yang sudah tidak ada di server kembali ke otomatis
  useEffect(() => {
    if (providers.length === 0) return;
    if (prefs.target !== "auto" && prefs.target !== "council" && !providers.some((p) => p.name === prefs.target)) {
      setPrefs((p) => ({ ...p, target: "auto" }));
    }
  }, [providers, prefs.target]);

  const selected = providers.find((p) => p.name === prefs.target);
  const hasToken = !!selected && !!tokens[selected.name];
  const useToken = !!selected?.byok && hasToken && prefs.useOwnToken;
  const canSetModel = useToken || role === "admin";

  const updateConv = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConvs((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  function newChat() {
    const c: Conversation = { id: newId(), title: "Obrolan baru", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    setConvs((p) => [c, ...p]);
    setActiveId(c.id);
    setSideOpen(false);
  }

  function deleteChat(id: string) {
    setConvs((p) => p.filter((c) => c.id !== id));
    if (id === activeId) setActiveId("");
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    let id = activeId;
    let base = active;
    if (!base) {
      base = { id: newId(), title: "Obrolan baru", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
      id = base.id;
      const created = base;
      setConvs((p) => [created, ...p]);
      setActiveId(id);
    }
    const userMsg: StoredMsg = { role: "user", content: text };
    const history = [...base.messages.filter((m) => !m.error), userMsg];
    updateConv(id, (c) => ({
      ...c,
      title: c.messages.length === 0 ? titleFrom(text) : c.title,
      updatedAt: Date.now(),
      messages: [...c.messages, userMsg],
    }));
    setInput("");
    setSending(true);

    const payload: Record<string, unknown> = {
      messages: history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    };
    if (prefs.target === "council") {
      payload.mode = "council";
      payload.reviewers = 2;
    } else if (selected) {
      payload.mode = "provider";
      payload.provider = selected.name;
      const tok = tokens[selected.name];
      if (useToken && tok) payload.userKey = tok.key;
      if (canSetModel && prefs.model.trim()) payload.model = prefs.model.trim();
    }

    const ctl = new AbortController();
    abortRef.current = ctl;
    const r = await api<ChatReply | CouncilReply | { attempts?: { provider: string; error: string }[] }>("/api/chat", {
      body: payload,
      signal: ctl.signal,
    });
    abortRef.current = null;
    setSending(false);

    if (r.status === 401) {
      window.location.href = "/login";
      return;
    }
    let reply: StoredMsg;
    if (r.ok && (r.data as ChatReply).kind === "chat") {
      const d = r.data as ChatReply;
      const meta: ChatMeta = { provider: d.provider, model: d.model, byok: d.byok, failed: d.failed, knowledge: d.knowledge, secondary: d.secondary };
      reply = { role: "assistant", content: d.text, meta };
    } else if (r.ok && (r.data as CouncilReply).kind === "council") {
      const d = r.data as CouncilReply;
      reply = { role: "assistant", content: councilText(d), meta: { provider: "dewan", council: d } };
    } else {
      const attempts = (r.data as { attempts?: { provider: string; error: string }[] }).attempts;
      const extra = attempts && attempts.length ? " (" + attempts.map((a) => `${a.provider}: ${a.error}`).join("; ").slice(0, 300) + ")" : "";
      reply = { role: "assistant", content: (r.error ?? "gagal") + extra, error: true };
    }
    updateConv(id, (c) => ({ ...c, updatedAt: Date.now(), messages: [...c.messages, reply] }));
  }

  function savePasted() {
    if (!selected) return;
    const key = pasteVal.trim();
    const problem = tokenFormatProblem(key);
    if (problem) {
      setPasteErr(problem);
      return;
    }
    saveToken(uid, selected.name, key, pasteRemember);
    setTokens(loadTokens(uid));
    setPrefs((p) => ({ ...p, useOwnToken: true }));
    setPasteVal("");
    setPasteErr("");
    setPasteOpen(false);
  }

  const messages = active?.messages ?? [];

  return (
    <div className="chat-layout">
      <aside className={`chat-side${sideOpen ? " open" : ""}`} aria-label="Riwayat obrolan">
        <div style={{ padding: ".6rem" }}>
          <button className="btn primary" style={{ width: "100%" }} onClick={newChat}>
            + Obrolan baru
          </button>
        </div>
        <div className="list">
          {convs.length === 0 ? <p className="muted small" style={{ padding: ".5rem" }}>Belum ada obrolan.</p> : null}
          {convs.map((c) => (
            <div
              key={c.id}
              className={`conv${c.id === activeId ? " active" : ""}`}
              onClick={() => {
                setActiveId(c.id);
                setSideOpen(false);
              }}
            >
              <span className="t" title={c.title}>
                {c.title}
              </span>
              <button
                aria-label={`Hapus obrolan ${c.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(c.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <p className="muted small" style={{ padding: ".6rem", margin: 0, borderTop: "1px solid var(--line)" }}>
          Riwayat disimpan di browser ini saja.
        </p>
      </aside>

      <section className="chat-main">
        <div className="chat-head">
          <button className="btn sm side-toggle" onClick={() => setSideOpen((v) => !v)} aria-label="Buka riwayat">
            ☰
          </button>
          <label className="row" style={{ gap: ".4rem" }}>
            <span className="muted small">AI</span>
            <select
              className="select"
              value={prefs.target}
              onChange={(e) => setPrefs((p) => ({ ...p, target: e.target.value }))}
              aria-label="Pilih AI"
            >
              <option value="auto">Otomatis (urutan prioritas + failover)</option>
              <option value="council">Dewan AI (Custom menjawab, AI lain menilai)</option>
              {providers.length > 0 ? (
                <optgroup label="Pilih satu AI">
                  {providers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} · {p.model}
                      {!p.available ? " (sedang cooldown)" : ""}
                      {tokens[p.name] ? " · token saya" : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>

          {selected?.byok ? (
            hasToken ? (
              <>
                <label className="row small" style={{ gap: ".35rem" }}>
                  <input
                    type="checkbox"
                    checked={prefs.useOwnToken}
                    onChange={(e) => setPrefs((p) => ({ ...p, useOwnToken: e.target.checked }))}
                  />
                  Pakai token saya <span className="muted">({maskToken(tokens[selected.name]?.key ?? "")})</span>
                </label>
              </>
            ) : (
              <button className="btn sm" onClick={() => setPasteOpen((v) => !v)}>
                Tempel token premium
              </button>
            )
          ) : null}
          {canSetModel && selected ? (
            <input
              className="input"
              style={{ width: 190 }}
              placeholder={`Model (bawaan: ${selected.model})`}
              value={prefs.model}
              onChange={(e) => setPrefs((p) => ({ ...p, model: e.target.value }))}
              aria-label="Nama model"
              maxLength={100}
            />
          ) : null}
          <span className="spacer" />
          <Link href="/dashboard" className="small">
            Kelola token
          </Link>
        </div>

        {pasteOpen && selected ? (
          <div className="chat-head" style={{ background: "var(--surface-2)" }}>
            <span className="small">Token untuk {selected.name}:</span>
            <input
              className="input"
              style={{ width: 280 }}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="tempel token/API key"
              value={pasteVal}
              onChange={(e) => setPasteVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePasted()}
            />
            <label className="row small" style={{ gap: ".3rem" }}>
              <input type="checkbox" checked={pasteRemember} onChange={(e) => setPasteRemember(e.target.checked)} />
              Ingat di perangkat ini
            </label>
            <button className="btn sm primary" onClick={savePasted}>
              Simpan
            </button>
            <button className="btn sm" onClick={() => setPasteOpen(false)}>
              Batal
            </button>
            {pasteErr ? <span className="small" style={{ color: "var(--danger)" }}>{pasteErr}</span> : null}
            <span className="muted small" style={{ flexBasis: "100%" }}>
              Token hanya disimpan di browser ini{pasteRemember ? " (tetap ada setelah ditutup)" : " (hilang saat tab ditutup)"} dan dikirim hanya saat Anda mengirim pesan ke AI ini. Server tidak menyimpannya.
            </span>
          </div>
        ) : null}

        {provError ? (
          <div className="alert err" style={{ margin: ".6rem 1rem 0" }}>
            {provError}
          </div>
        ) : null}

        <div className="msgs">
          <div className="msgs-inner">
            {messages.length === 0 ? (
              <div className="empty">
                <h2>Mau bertanya apa?</h2>
                <p>
                  Pilih AI di atas. Dengan <strong>Otomatis</strong>, Custom AI menjawab lebih dulu, lalu AI lain mengambil alih bila perlu. Punya token premium sendiri? Pilih satu AI lalu tempel tokennya.
                </p>
              </div>
            ) : (
              messages.map((m, i) => <Bubble key={i} m={m} />)
            )}
            {sending ? (
              <div className="msg assistant" aria-live="polite">
                <div className="bubble">
                  <span className="typing" aria-label="AI sedang menjawab">
                    <i />
                    <i />
                    <i />
                  </span>
                  {prefs.target === "council" ? <span className="muted small"> Dewan bisa memakan waktu hingga satu menit.</span> : null}
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
        </div>

        <div className="composer">
          <div className="composer-inner">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              placeholder="Tulis pesan… (Enter kirim, Shift+Enter baris baru)"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              maxLength={8000}
              aria-label="Pesan"
            />
            <div className="row" style={{ marginTop: ".4rem" }}>
              <span className="muted small">
                {prefs.target === "auto"
                  ? "Mode otomatis"
                  : prefs.target === "council"
                    ? "Mode dewan"
                    : `${prefs.target}${useToken ? " dengan token Anda" : ""} saja, tanpa pindah ke AI lain`}
              </span>
              <span className="spacer" />
              {sending ? (
                <button className="btn" onClick={() => abortRef.current?.abort()}>
                  Batal
                </button>
              ) : null}
              <button className="btn primary" onClick={() => void send()} disabled={sending || !input.trim()}>
                Kirim
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
