import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { downloadStored } from "@/lib/documents";
import { fileForUser } from "@/lib/services/files";

const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"]);

/** Every private document download goes through here and is checked against the signed-in user. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.redirect(new URL(`/login?next=/files/${id}`, request.url), 303);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const file = await fileForUser(getDb(), user.id, id);
  if (!file) notFound();
  const inline = INLINE.has(file.mime) && new URL(request.url).searchParams.get("download") !== "1";
  const out = await downloadStored(file.storageKey, file.name, file.mime, inline).catch(() => null);
  if (!out) notFound();
  if ("redirect" in out) return Response.redirect(out.redirect, 302);
  return new Response(new Uint8Array(out.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.name.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
