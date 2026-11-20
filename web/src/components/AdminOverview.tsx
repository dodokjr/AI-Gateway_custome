"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

interface KeyStatus { key: string; available: boolean; cooldown_sec: number; ok: number; fail: number; last_error?: string }
interface Prov { name: string; type: string; model: string; priority: number; keys: KeyStatus[] }
interface Check { name: string; ok: boolean; detail?: string }
interface Heal { name: string; report: { healthy: boolean; checks: Check[]; build: string; circuit: string }; maintenance?: Record<string, number | boolean>; error?: string }

export default function AdminOverview() {
  const [provs, setProvs] = useState<Prov[]>([]);
  const [storage, setStorage] = useState("");
  const [users, setUsers] = useState<{ total: number; messages: number } | null>(null);
  const [err, setErr] = useState("");
  const [heal, setHeal] = useState<Heal[] | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [s, u] = await Promise.all([
      api<{ providers: Prov[]; storage: string }>("/api/admin/gw/status"),
      api<{ users: { usage: { messages: number } }[] }>("/api/admin/users"),
    ]);
    if (s.ok) {
      setProvs(s.data.providers);
      setStorage(s.data.storage);
      setErr("");
    } else setErr(s.error ?? "gagal memuat status gateway");
    if (u.ok) setUsers({ total: u.data.users.length, messages: u.data.users.reduce((n, x) => n + x.usage.messages, 0) });
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function run(kind: "check" | "heal") {
    setBusy(kind);
    setNote("");
    const r = await api<{ custom: Heal[] }>(kind === "check" ? "/api/admin/gw/selfcheck" : "/api/admin/gw/selfheal", {
      method: kind === "check" ? "GET" : "POST",
      body: kind === "heal" ? {} : undefined,
    });
    if (r.ok) {
      setHeal(r.data.custom);
      setNote(kind === "heal" ? "Pemeliharaan selesai." : "Uji diri selesai.");
    } else setNote(r.error ?? "gagal");
    setBusy("");
  }

  const total = provs.length;
  const active = provs.filter((p) => p.keys.some((k) => k.available)).length;

  return (
    <div>
      {err ? <div className="alert err">{err}</div> : null}
      <div className="grid cols-3" style={{ marginBottom: "1rem" }}>
        <div className="card stat"><div className="muted small">Provider aktif</div><div className="n">{active}<span className="muted" style={{ fontSize: "1rem" }}> / {total}</span></div></div>
        <div className="card stat"><div className="muted small">Pengguna</div><div className="n">{users?.total ?? "—"}</div></div>
        <div className="card stat"><div className="muted small">Total pesan pengguna</div><div className="n">{users?.messages ?? "—"}</div></div>
        <div className="card stat"><div className="muted small">Penyimpanan pengetahuan</div><div style={{ fontWeight: 600, marginTop: ".4rem" }}>{storage || "—"}</div></div>
      </div>

      <h2>Provider AI</h2>
      <div className="table-wrap" style={{ marginBottom: "1.5rem" }}>
        <table>
          <thead><tr><th>Prioritas</th><th>Nama</th><th>Model</th><th>Key</th><th>Berhasil / gagal</th><th>Status</th></tr></thead>
          <tbody>
            {provs.map((p) => {
              const ok = p.keys.reduce((n, k) => n + k.ok, 0);
              const bad = p.keys.reduce((n, k) => n + k.fail, 0);
              const avail = p.keys.filter((k) => k.available).length;
              const cool = Math.max(0, ...p.keys.map((k) => k.cooldown_sec));
              const lastErr = p.keys.map((k) => k.last_error).find(Boolean);
              return (
                <tr key={p.name}>
                  <td>{p.priority}</td>
                  <td><strong>{p.name}</strong> <span className="badge">{p.type}</span></td>
                  <td><code>{p.model}</code></td>
                  <td>{avail}/{p.keys.length} <span className="muted small">{p.keys.map((k) => k.key).join(", ")}</span></td>
                  <td>{ok} / {bad}</td>
                  <td>
                    {avail > 0 ? <span className="badge ok">siap</span> : <span className="badge bad">cooldown {cool}s</span>}
                    {lastErr ? <div className="muted small" style={{ maxWidth: 320, overflowWrap: "anywhere" }}>{lastErr.slice(0, 140)}</div> : null}
                  </td>
                </tr>
              );
            })}
            {provs.length === 0 ? <tr><td colSpan={6} className="muted">Tidak ada data.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h2>Kesehatan Custom AI</h2>
      <div className="row" style={{ marginBottom: ".8rem" }}>
        <button className="btn" disabled={!!busy} onClick={() => run("check")}>{busy === "check" ? "Menguji…" : "Jalankan uji diri"}</button>
        <button className="btn" disabled={!!busy} onClick={() => run("heal")}>{busy === "heal" ? "Merawat…" : "Pelihara dan perbaiki memori"}</button>
        {note ? <span className="muted small">{note}</span> : null}
      </div>
      {heal?.map((h) => (
        <div className="card" key={h.name}>
          <div className="row">
            <strong>{h.name}</strong>
            <span className={`badge ${h.report.healthy ? "ok" : "bad"}`}>{h.report.healthy ? "sehat" : "bermasalah"}</span>
            <span className="badge">sirkuit: {h.report.circuit}</span>
            <span className="muted small">build {h.report.build}</span>
          </div>
          {h.error ? <div className="alert err" style={{ marginTop: ".5rem" }}>{h.error}</div> : null}
          <ul className="small" style={{ paddingLeft: "1.2rem", marginBottom: 0 }}>
            {h.report.checks.map((c) => (
              <li key={c.name} style={{ color: c.ok ? undefined : "var(--danger)" }}>
                {c.ok ? "✓" : "✗"} {c.name}{c.detail ? <span className="muted"> — {c.detail}</span> : null}
              </li>
            ))}
          </ul>
          {h.maintenance ? (
            <p className="muted small" style={{ marginBottom: 0, marginTop: ".5rem" }}>
              Pemeliharaan: {Object.entries(h.maintenance).map(([k, v]) => `${k}=${String(v)}`).join(", ")}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
