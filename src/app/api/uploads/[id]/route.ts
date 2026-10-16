import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { MAX_FILE_BYTES, writeLocal } from "@/lib/documents";
import { pendingUploadFor } from "@/lib/services/files";

/** The local stand-in for a presigned R2 upload: only the uploader, only while the file is unclaimed. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in again.", { status: 401 });
  const file = /^[0-9a-f-]{36}$/i.test(id) ? await pendingUploadFor(getDb(), user.id, id) : null;
  if (!file) return new Response("Not found.", { status: 404 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) return new Response("Too big.", { status: 413 });
  try {
    await writeLocal(file.storageKey, bytes);
  } catch {
    return new Response("Uploads go to cloud storage.", { status: 400 });
  }
  return new Response(null, { status: 204 });
}
