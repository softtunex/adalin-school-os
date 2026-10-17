import "server-only";
import { headers } from "next/headers";
import { getDb } from "../db/client";
import { schoolForHost } from "../services/domains";

/** The school this request came in on, when it's that school's own live web address. */
export async function hostSchool() {
  const h = await headers();
  return schoolForHost(getDb(), h.get("x-forwarded-host") ?? h.get("host"));
}
