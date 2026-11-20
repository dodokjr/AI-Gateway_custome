import ChatApp from "@/components/ChatApp";
import Shell from "@/components/Shell";
import { requireUser } from "@/lib/server-auth";
import { toPublic } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await requireUser();
  return (
    <Shell user={toPublic(user)} active="chat">
      <ChatApp uid={user.id} role={user.role} />
    </Shell>
  );
}
