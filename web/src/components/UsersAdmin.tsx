"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

interface Row {
  id: string; email: string; name: string; role: "admin" | "user"; disabled: boolean;
  createdAt: string; lastLoginAt?: string;
  usage: { messages: number; byok: number; council: number; lastAt?: string };
}

const fmt = (s?: string) => (s ? new Date(s).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" }) : "—");

export default function UsersAdmin({ meId }: { meId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "user" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ users: Row[] }>("/api/admin/users");
    if (r.ok) setRows(r.data.users);
    else setMsg({ ok: false, text: r.error ?? "gagal memuat" });
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>, okText: string) {
    const r = await api("/api/admin/users", { method: "PATCH", body: { id, ...body } });
    setMsg({ ok: r.ok, text: r.ok ? okText : (r.error ?? "gagal") });
    await load();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/admin/users", { body: form });
    setMsg({ ok: r.ok, text: r.ok ? "Pengguna dibuat." : (r.error ?? "gagal") });
    if (r.ok) setForm({ email: "", name: "", password: "", role: "user" });
    setBusy(false);
    await load();
  }

  return (
    <div>
      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</div> : null}
      <div className="table-wrap" style={{ marginBottom: "1.5rem" }}>
        <table>
          <thead><tr><th>Pengguna</th><th>Peran</th><th>Pesan</th><th>Token sendiri</th><th>Terakhir aktif</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((u) => {
              const me = u.id === meId;
              return (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong>{me ? <span className="badge accent" style={{ marginLeft: 6 }}>Anda</span> : null}<div className="muted small">{u.email}</div></td>
                  <td>
                    <select className="select" style={{ minWidth: 90, minHeight: 30 }} value={u.role} disabled={me}
                      onChange={(e) => patch(u.id, { role: e.target.value }, "Peran diubah.")} aria-label={`Peran ${u.email}`}>
                      <option value="user">user</option><option value="admin">admin</option>
                    </select>
                  </td>
                  <td>{u.usage.messages}</td>
                  <td>{u.usage.byok}</td>
                  <td className="small">{fmt(u.usage.lastAt ?? u.lastLoginAt)}</td>
                  <td>{u.disabled ? <span className="badge bad">nonaktif</span> : <span className="badge ok">aktif</span>}</td>
                  <td>
                    <div className="row">
                      <button className="btn sm" disabled={me} onClick={() => patch(u.id, { disabled: !u.disabled }, u.disabled ? "Diaktifkan." : "Dinonaktifkan.")}>
                        {u.disabled ? "Aktifkan" : "Nonaktifkan"}
                      </button>
                      <button className="btn sm" onClick={() => {
                        const pw = prompt(`Sandi baru untuk ${u.email} (minimal 10 karakter):`);
                        if (pw) void patch(u.id, { password: pw }, "Sandi direset.");
                      }}>Reset sandi</button>
                      <button className="btn sm danger" disabled={me} onClick={async () => {
                        if (!confirm(`Hapus ${u.email}? Tidak bisa dibatalkan.`)) return;
                        const r = await api(`/api/admin/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
                        setMsg({ ok: r.ok, text: r.ok ? "Pengguna dihapus." : (r.error ?? "gagal") });
                        await load();
                      }}>Hapus</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={create} style={{ maxWidth: 520 }}>
        <h2>Tambah pengguna</h2>
        <label className="field"><span>Email</span><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="field"><span>Nama</span><input className="input" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="field"><span>Sandi awal (minimal 10 karakter)</span><input className="input" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <label className="field"><span>Peran</span>
          <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="user">user</option><option value="admin">admin</option></select>
        </label>
        <button className="btn primary" disabled={busy}>Buat pengguna</button>
      </form>
    </div>
  );
}
