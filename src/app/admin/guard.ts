import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { requirePlatformAdmin } from "@/lib/services/platform";

/** The Adalin team only. Anyone else gets a plain 404, so the console can't be found by probing. */
export async function requireAdmin() {
  const user = await requireUser();
  try {
    return await requirePlatformAdmin(getDb(), user.id);
  } catch {
    notFound();
  }
}
