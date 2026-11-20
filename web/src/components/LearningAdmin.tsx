"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

interface ReviewItem { id: string; question: string; answer: string; source: string; trust: string; peers?: string[]; conflicts: number; expires?: string }
interface Example { id: string; question: string; answer: string; tags?: string[]; score: number }

const TRUST_CLS: Record<string, string> = { terverifikasi: "ok", konsensus: "accent", pengguna: "ok", "belum-diverifikasi": "warn" };

export default function LearningAdmin() {
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [items, setItems] = useState<Example[]>([]);
  const [q, setQ] = useState("");
  const [persona, setPersona] = useState("");
  const [teach, setTeach] = useState({ question: "", answer: "", tags: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadReview = useCallback(async () => {
    const r = await api<{ review: ReviewItem[]; stats: Record<string, Record<string, number>> }>("/api/admin/gw/learn/review?limit=50");
    if (r.ok) {
      setReview(r.data.review ?? []);
      setStats(Object.values(r.data.stats ?? {})[0] ?? {});
    } else setMsg({ ok: false, text: r.error ?? "gagal memuat antrean" });
  }, []);
  const loadItems = useCallback(async (query: string) => {
    const r = await api<{ items: Example[] }>("/api/admin/gw/train" + (query ? `?q=${encodeURIComponent(query)}` : ""));
    if (r.ok) setItems(r.data.items ?? []);
  }, []);

  useEffect(() => {
    void loadReview();
    void loadItems("");
    api<{ persona: string }>("/api/admin/gw/persona").then((r) => r.ok && setPersona(r.data.persona ?? ""));
  }, [loadReview, loadItems]);

  async function rate(id: string, rating: 1 | -1) {
    const r = await api("/api/admin/gw/feedback", { body: { id, rating } });
    setMsg({ ok: r.ok, text: r.ok ? (rating === 1 ? "Dinaikkan: jawaban ini dipercaya." : "Diturunkan.") : (r.error ?? "gagal") });
    await loadReview();
  }

  async function submitTeach(e: React.FormEvent) {
    e.preventDefault();
    const tags = teach.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const r = await api("/api/admin/gw/train", { body: { question: teach.question, answer: teach.answer, tags } });
    setMsg({ ok: r.ok, text: r.ok ? "Disimpan sebagai jawaban pengguna (otoritatif)." : (r.error ?? "gagal") });
    if (r.ok) {
      setTeach({ question: "", answer: "", tags: "" });
      await loadItems(q);
    }
  }

  return (
    <div>
      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</div> : null}

      <section className="card">
        <div className="row"><h2 style={{ margin: 0 }}>Antrean tinjau</h2><span className="spacer" />
          {Object.entries(stats).map(([k, v]) => <span key={k} className={`badge ${TRUST_CLS[k] ?? ""}`}>{k}: {v}</span>)}
        </div>
        <p className="muted small">Yang paling tidak pasti ada di atas. Setujui jawaban yang benar agar permanen; turunkan yang salah.</p>
        {review.length === 0 ? <p className="muted">Tidak ada yang perlu ditinjau.</p> : null}
        {review.map((it) => (
          <div key={it.id} className="op" style={{ marginBottom: ".6rem" }}>
            <div className="row">
              <strong style={{ overflowWrap: "anywhere" }}>{it.question}</strong>
              <span className="spacer" />
              <span className={`badge ${TRUST_CLS[it.trust] ?? ""}`}>{it.trust}</span>
              {it.conflicts > 0 ? <span className="badge bad">{it.conflicts} konflik</span> : null}
              <span className="badge">{it.source}</span>
            </div>
            <p className="small" style={{ margin: ".4rem 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{it.answer}</p>
            <div className="row">
              <button className="btn sm" onClick={() => rate(it.id, 1)}>✓ Benar</button>
              <button className="btn sm danger" onClick={() => rate(it.id, -1)}>✗ Salah</button>
              <code className="muted small">{it.id}</code>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Ajari Custom AI</h2>
        <form onSubmit={submitTeach}>
          <label className="field"><span>Pertanyaan</span><input className="input" required maxLength={500} value={teach.question} onChange={(e) => setTeach({ ...teach, question: e.target.value })} /></label>
          <label className="field"><span>Jawaban yang benar</span><textarea className="textarea" required maxLength={4000} value={teach.answer} onChange={(e) => setTeach({ ...teach, answer: e.target.value })} /></label>
          <label className="field"><span>Tag (pisahkan koma, opsional)</span><input className="input" value={teach.tags} onChange={(e) => setTeach({ ...teach, tags: e.target.value })} /></label>
          <button className="btn primary">Simpan</button>
        </form>
      </section>

      <section className="card">
        <div className="row"><h2 style={{ margin: 0 }}>Pengetahuan terlatih ({items.length})</h2><span className="spacer" />
          <input className="input" style={{ maxWidth: 240 }} placeholder="cari…" value={q} onChange={(e) => { setQ(e.target.value); void loadItems(e.target.value); }} aria-label="Cari pengetahuan" />
        </div>
        <div className="table-wrap" style={{ marginTop: ".7rem" }}>
          <table>
            <thead><tr><th>Pertanyaan</th><th>Jawaban</th><th>Skor</th><th /></tr></thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td style={{ overflowWrap: "anywhere" }}>{e.question}{e.tags?.length ? <div>{e.tags.map((t) => <span key={t} className="badge" style={{ marginRight: 4 }}>{t}</span>)}</div> : null}</td>
                  <td className="small" style={{ overflowWrap: "anywhere", maxWidth: 420 }}>{e.answer.slice(0, 240)}{e.answer.length > 240 ? "…" : ""}</td>
                  <td>{e.score}</td>
                  <td><button className="btn sm danger" onClick={async () => {
                    if (!confirm("Hapus pengetahuan ini?")) return;
                    const r = await api(`/api/admin/gw/train/${encodeURIComponent(e.id)}`, { method: "DELETE" });
                    setMsg({ ok: r.ok, text: r.ok ? "Dihapus." : (r.error ?? "gagal") });
                    await loadItems(q);
                  }}>Hapus</button></td>
                </tr>
              ))}
              {items.length === 0 ? <tr><td colSpan={4} className="muted">Belum ada.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Persona</h2>
        <p className="muted small">Instruksi dasar yang dipakai semua AI (maksimal 4000 karakter).</p>
        <textarea className="textarea" style={{ minHeight: 130 }} maxLength={4000} value={persona} onChange={(e) => setPersona(e.target.value)} />
        <div style={{ marginTop: ".6rem" }}>
          <button className="btn" onClick={async () => {
            const r = await api("/api/admin/gw/persona", { method: "PUT", body: { persona } });
            setMsg({ ok: r.ok, text: r.ok ? "Persona disimpan." : (r.error ?? "gagal") });
          }}>Simpan persona</button>
        </div>
      </section>
    </div>
  );
}
