"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

interface Rec { time: string; question: string; answer: string; provider: string; model?: string; via: string; source?: string; trust?: string; verdict?: string }

export default function LogsAdmin() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [info, setInfo] = useState<{ count: number; storage: string; last_write_error: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ count: number; storage: string; last_write_error: string; records: Rec[] | null }>("/api/admin/gw/training/log?limit=100");
    if (r.ok) {
      setRecs(r.data.records ?? []);
      setInfo({ count: r.data.count, storage: r.data.storage, last_write_error: r.data.last_write_error });
    } else setMsg({ ok: false, text: r.error ?? "gagal memuat log" });
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function replay() {
    setBusy(true);
    const r = await api<{ read: number; offered: number; learned: number; skipped: number }>("/api/admin/gw/training/replay", { body: { limit: 1000 } });
    setMsg(r.ok
      ? { ok: true, text: `Dibaca ${r.data.read}, ditawarkan ${r.data.offered}, dipelajari ${r.data.learned}, dilewati ${r.data.skipped}.` }
      : { ok: false, text: r.error ?? "gagal" });
    setBusy(false);
  }

  const off = info?.storage === "nonaktif";

  return (
    <div>
      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</div> : null}
      {off ? <div className="alert info">Pencatatan log nonaktif. Hapus <code>LOG_QA=0</code> dari .env gateway lalu mulai ulang server.</div> : null}
      {info?.last_write_error ? <div className="alert err">Galat tulis terakhir: {info.last_write_error}</div> : null}
      <div className="row" style={{ marginBottom: ".8rem" }}>
        <span className="badge">{info ? `${info.count} catatan` : "…"}</span>
        <span className="badge">penyimpanan: {info?.storage ?? "…"}</span>
        <span className="spacer" />
        <button className="btn" onClick={load}>Muat ulang</button>
        <a className="btn" href="/api/admin/gw/training/export?limit=10000&exclude_custom=1" download>Ekspor JSONL</a>
        <button className="btn" disabled={busy || off} onClick={replay}>Putar ulang ke memori</button>
        <button className="btn danger" disabled={off} onClick={async () => {
          if (!confirm("Hapus SEMUA log tanya-jawab? Memori Custom AI tidak ikut terhapus.")) return;
          const r = await api("/api/admin/gw/training/log", { method: "DELETE" });
          setMsg({ ok: r.ok, text: r.ok ? "Log dihapus." : (r.error ?? "gagal") });
          await load();
        }}>Hapus log</button>
      </div>
      <p className="muted small">Percakapan yang memakai token pribadi pengguna tidak pernah dicatat di sini. Ekspor memakai format pelatihan <code>{"{\"messages\":[user,assistant]}"}</code> dan melewatkan jawaban Custom AI sendiri.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Waktu</th><th>Lewat</th><th>AI</th><th>Pertanyaan</th><th>Jawaban</th></tr></thead>
          <tbody>
            {recs.map((r, i) => (
              <tr key={i}>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{new Date(r.time).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" })}</td>
                <td><span className="badge">{r.via}</span>{r.verdict ? <div className="muted small">{r.verdict}</div> : null}</td>
                <td>{r.provider}<div className="muted small">{r.model}</div></td>
                <td style={{ overflowWrap: "anywhere", maxWidth: 260 }}>{r.question.slice(0, 200)}</td>
                <td className="small" style={{ overflowWrap: "anywhere", maxWidth: 380 }}>{r.answer.slice(0, 260)}{r.answer.length > 260 ? "…" : ""}</td>
              </tr>
            ))}
            {recs.length === 0 ? <tr><td colSpan={5} className="muted">Belum ada catatan.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
