import UsersAdmin from "@/components/UsersAdmin";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireAdmin();
  return <UsersAdmin meId={me.id} />;
}
