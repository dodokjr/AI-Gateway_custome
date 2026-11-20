"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { clearChats, loadChats } from "./chatstore";
import { clearTokens } from "./vault";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/auth/password", { body: { current, next } });
    setMsg({ ok: r.ok, text: r.ok ? "Sandi diganti." : (r.error ?? "gagal") });
    if (r.ok) {
      setCurrent("");
      setNext("");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
      <label className="field">
        <span>Sandi saat ini</span>
        <input className="input" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </label>
      <label className="field">
        <span>Sandi baru (minimal 10 karakter)</span>
        <input className="input" type="password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </label>
      <button className="btn" disabled={busy}>
        Ganti sandi
      </button>
    </form>
  );
}

export function DataTools({ uid }: { uid: string }) {
  const [count, setCount] = useState(0);
  const [msgs, setMsgs] = useState(0);
  const [note, setNote] = useState("");

  const refresh = () => {
    const c = loadChats(uid);
    setCount(c.length);
    setMsgs(c.reduce((n, x) => n + x.messages.length, 0));
  };
  useEffect(refresh, [uid]);

  function exportChats() {
    const blob = new Blob([JSON.stringify(loadChats(uid), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "riwayat-chat.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <p>
        Riwayat di browser ini: <strong>{count}</strong> obrolan, <strong>{msgs}</strong> pesan.
      </p>
      {note ? <div className="alert info">{note}</div> : null}
      <div className="row">
        <button className="btn" onClick={exportChats} disabled={count === 0}>
          Ekspor riwayat (JSON)
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm("Hapus semua riwayat obrolan di browser ini? Tidak bisa dibatalkan.")) {
              clearChats(uid);
              refresh();
              setNote("Riwayat dihapus.");
            }
          }}
          disabled={count === 0}
        >
          Hapus riwayat
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm("Hapus semua token premium yang tersimpan di browser ini?")) {
              clearTokens(uid);
              setNote("Semua token di browser ini dihapus.");
            }
          }}
        >
          Hapus semua token
        </button>
      </div>
    </div>
  );
}
