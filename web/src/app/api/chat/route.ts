import { handleChat } from "@/lib/chat";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  return handleChat(req);
}
