import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/chat");
  return <AuthForm mode="login" allowSignup={env.allowSignup} />;
}
