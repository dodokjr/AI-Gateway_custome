import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await currentUser()) redirect("/chat");
  if (!env.allowSignup) redirect("/login");
  return <AuthForm mode="register" allowSignup />;
}
