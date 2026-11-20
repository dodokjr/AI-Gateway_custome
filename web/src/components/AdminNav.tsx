"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Ringkasan" },
  { href: "/admin/users", label: "Pengguna" },
  { href: "/admin/learning", label: "Pelatihan Custom AI" },
  { href: "/admin/logs", label: "Log tanya-jawab" },
];

export default function AdminNav() {
  const p = usePathname();
  return (
    <nav className="subnav" aria-label="Admin">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={p === i.href ? "active" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
