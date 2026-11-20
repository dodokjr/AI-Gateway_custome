"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "./api";

export default function AuthForm({ mode, allowSignup }: { mode: "login" | "register"; allowSignup: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isLogin = mode === "login";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await api(isLogin ? "/api/auth/login" : "/api/auth/register", {
      body: isLogin ? { email, password } : { email, name, password },
    });
    if (r.ok) {
      window.location.href = "/chat";
      return;
    }
    setError(r.error ?? "gagal");
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>{isLogin ? "Masuk" : "Buat akun"}</h1>
        <p className="muted small">AI Gateway: satu tempat untuk banyak AI.</p>
        {error ? (
          <div className="alert err" role="alert">
            {error}
          </div>
        ) : null}
        {!isLogin ? (
          <label className="field">
            <span>Nama</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} />
          </label>
        ) : null}
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>Sandi{!isLogin ? " (minimal 10 karakter)" : ""}</span>
          <input
            className="input"
            type="password"
            required
            minLength={isLogin ? undefined : 10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
        </label>
        <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Memproses…" : isLogin ? "Masuk" : "Daftar"}
        </button>
        <p className="small muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          {isLogin ? (
            allowSignup ? (
              <>
                Belum punya akun? <Link href="/register">Daftar</Link>
              </>
            ) : (
              "Pendaftaran ditutup. Hubungi admin untuk akun."
            )
          ) : (
            <>
              Sudah punya akun? <Link href="/login">Masuk</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
