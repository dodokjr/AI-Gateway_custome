import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const u = await currentUser();
  redirect(u ? "/chat" : "/login");
}
