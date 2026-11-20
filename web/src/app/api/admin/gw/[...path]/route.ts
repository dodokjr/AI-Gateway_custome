import { handleAdminGw } from "@/lib/adminproxy";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ path: string[] }> };

async function h(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return handleAdminGw(req, path);
}

export const GET = h;
export const POST = h;
export const PUT = h;
export const DELETE = h;
