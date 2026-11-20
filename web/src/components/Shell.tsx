import Link from "next/link";
import type { PublicUser } from "@/lib/users";
import LogoutButton from "./LogoutButton";

type Active = "chat" | "dashboard" | "admin";

export default function Shell({ user, active, children }: { user: PublicUser; active: Active; children: React.ReactNode }) {
  const cls = (a: Active) => (active === a ? "active" : undefined);
  return (
    <>
      <header className="topbar">
        <Link href="/chat" className="brand">
          <i aria-hidden /> AI Gateway
        </Link>
        <nav className="nav" aria-label="Utama">
          <Link href="/chat" className={cls("chat")}>
            Chat
          </Link>
          <Link href="/dashboard" className={cls("dashboard")}>
            Dasbor
          </Link>
          {user.role === "admin" ? (
            <Link href="/admin" className={cls("admin")}>
              Admin
            </Link>
          ) : null}
        </nav>
        <span className="spacer" />
        <span className="muted small" title={user.email} style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.name}
        </span>
        <LogoutButton />
      </header>
      {children}
    </>
  );
}
