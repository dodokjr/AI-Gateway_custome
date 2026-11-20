import { DataTools, PasswordForm } from "@/components/AccountTools";
import Shell from "@/components/Shell";
import TokenManager from "@/components/TokenManager";
import { requireUser } from "@/lib/server-auth";
import { getUsage } from "@/lib/usage";
import { toPublic } from "@/lib/users";

export const dynamic = "force-dynamic";

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
}

export default async function DashboardPage() {
  const user = await requireUser();
  const usage = await getUsage(user.id);
  const rows = Object.entries(usage.byProvider).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));

  return (
    <Shell user={toPublic(user)} active="dashboard">
      <main className="page">
        <div className="page-title">
          <h1>Dasbor saya</h1>
          <span className="muted">
            {user.name} · {user.email} · <span className="badge">{user.role}</span>
          </span>
        </div>

        <div className="grid cols-3" style={{ marginBottom: "1rem" }}>
          <div className="card stat">
            <div className="muted small">Total pesan</div>
            <div className="n">{usage.messages}</div>
          </div>
          <div className="card stat">
            <div className="muted small">Memakai token sendiri</div>
            <div className="n">{usage.byok}</div>
          </div>
          <div className="card stat">
            <div className="muted small">Mode dewan</div>
            <div className="n">{usage.council}</div>
          </div>
          <div className="card stat">
            <div className="muted small">Terakhir aktif</div>
            <div style={{ fontWeight: 600, marginTop: ".4rem" }}>{fmt(usage.lastAt)}</div>
          </div>
        </div>

        <div className="grid cols-2">
          <section className="card">
            <h2>Pemakaian per AI</h2>
            {rows.length === 0 ? (
              <p className="muted">Belum ada pesan.</p>
            ) : (
              rows.map(([name, n]) => (
                <div key={name} style={{ marginBottom: ".6rem" }}>
                  <div className="row small">
                    <strong>{name}</strong>
                    <span className="spacer" />
                    <span className="muted">{n} pesan</span>
                  </div>
                  <div className="bar" aria-hidden>
                    <i style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="card">
            <h2>Riwayat dan data</h2>
            <DataTools uid={user.id} />
          </section>
        </div>

        <section className="card" style={{ marginTop: "1rem" }}>
          <h2>Token premium saya</h2>
          <p className="muted small">
            Punya langganan atau API key berbayar dari penyedia AI (OpenAI, Anthropic, Gemini, dan lainnya)? Tempel di sini untuk mengobrol memakai kuota Anda sendiri, bukan kuota server.
          </p>
          <TokenManager uid={user.id} />
        </section>

        <section className="card" style={{ marginTop: "1rem", maxWidth: 440 }}>
          <h2>Ganti sandi</h2>
          <PasswordForm />
        </section>
      </main>
    </Shell>
  );
}
