import AdminNav from "@/components/AdminNav";
import Shell from "@/components/Shell";
import { requireAdmin } from "@/lib/server-auth";
import { toPublic } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <Shell user={toPublic(user)} active="admin">
      <main className="page">
        <div className="page-title">
          <h1>Dasbor admin</h1>
        </div>
        <AdminNav />
        {children}
      </main>
    </Shell>
  );
}
