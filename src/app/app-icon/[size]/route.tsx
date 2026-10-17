import { appIcon } from "@/lib/app-icon";

const SIZES = new Set([192, 512]);

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const res = appIcon(size, { maskable: new URL(request.url).searchParams.has("maskable") });
  res.headers.set("Cache-Control", "public, max-age=604800, immutable");
  return res;
}
