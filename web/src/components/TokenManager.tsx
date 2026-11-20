"use client";

import { useEffect, useState } from "react";
import type { ProviderInfo } from "@/lib/providers";
import { api } from "./api";
import { loadTokens, maskToken, removeToken, saveToken, tokenFormatProblem, type TokenMap } from "./vault";

export default function TokenManager({ uid }: { uid: string }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [tokens, setTokens] = useState<TokenMap>({});
  const [provider, setProvider] = useState("");
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTokens(loadTokens(uid));
    api<{ providers: ProviderInfo[] }>("/api/providers").then((r) => {
      if (r.ok) {
        const list = r.data.providers.filter((p) => p.byok);
        setProviders(list);
        setProvider((cur) => cur || (list[0]?.name ?? ""));
      } else setMsg({ kind: "err", text: r.error ?? "gagal memuat daftar AI" });
    });
  }, [uid]);

  async function test(name: string, key: string): Promise<boolean> {
    const r = await api<{ text?: string }>("/api/chat", {
      body: { messages: [{ role: "user", content: "Balas dengan satu kata saja: ok" }], provider: name, userKey: key },
    });
    if (r.ok) {
      setMsg({ kind: "ok", text: `Token ${name} berfungsi. Balasan: “${(r.data.text ?? "").slice(0, 60)}”` });
      return true;
    }
    setMsg({ kind: "err", text: `Token ${name} gagal: ${r.error ?? "tidak diketahui"}` });
    return false;
  }

  async function add(andTest: boolean) {
    const key = value.trim();
    const problem = tokenFormatProblem(key);
    if (!provider) return setMsg({ kind: "err", text: "pilih AI dulu" });
    if (problem) return setMsg({ kind: "err", text: problem });
    setBusy(true);
    setMsg(null);
    saveToken(uid, provider, key, remember);
    setTokens(loadTokens(uid));
    setValue("");
    if (andTest) await test(provider, key);
    else setMsg({ kind: "info", text: `Token ${provider} disimpan di browser ini.` });
    setBusy(false);
  }

  const entries = Object.entries(tokens);

  return (
    <div>
      {msg ? (
        <div className={`alert ${msg.kind}`} role="status">
          {msg.text}
        </div>
      ) : null}
      {entries.length === 0 ? (
        <p className="muted">Belum ada token tersimpan di browser ini.</p>
      ) : (
        <div className="table-wrap" style={{ marginBottom: "1rem" }}>
          <table>
            <thead>
              <tr>
                <th>AI</th>
                <th>Token</th>
                <th>Penyimpanan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map(([name, t]) => (
                <tr key={name}>
                  <td>
                    <strong>{name}</strong>
                  </td>
                  <td>
                    <code>{maskToken(t.key)}</code>
                  </td>
                  <td>
                    <span className="badge">{t.remember ? "perangkat ini" : "sesi tab"}</span>
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); await test(name, t.key); setBusy(false); }}>
                        Uji
                      </button>
                      <button
                        className="btn sm danger"
                        onClick={() => {
                          removeToken(uid, name);
                          setTokens(loadTokens(uid));
                        }}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Tambah token premium</h3>
      <div className="grid cols-2">
        <label className="field">
          <span>AI</span>
          <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} · {p.model}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Token / API key</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="tempel di sini"
          />
        </label>
      </div>
      <label className="row small" style={{ gap: ".4rem", marginBottom: ".8rem" }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Ingat di perangkat ini (jika tidak, token hilang saat tab ditutup)
      </label>
      <div className="row">
        <button className="btn primary" disabled={busy || !value.trim()} onClick={() => add(true)}>
          Simpan dan uji
        </button>
        <button className="btn" disabled={busy || !value.trim()} onClick={() => add(false)}>
          Simpan saja
        </button>
      </div>
      <p className="muted small" style={{ marginTop: ".8rem" }}>
        Token hanya ada di browser ini dan dikirim hanya saat Anda mengobrol dengan AI yang bersangkutan. Server tidak menyimpannya dan percakapan memakai token Anda tidak dicatat untuk melatih Custom AI. Hindari menempel token di komputer bersama.
      </p>
    </div>
  );
}
