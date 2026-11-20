"use client";

import { api } from "./api";

export default function LogoutButton() {
  return (
    <button
      className="btn sm"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST", body: {} });
        window.location.href = "/login";
      }}
    >
      Keluar
    </button>
  );
}
