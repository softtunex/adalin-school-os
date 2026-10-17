import "server-only";
import { eq } from "drizzle-orm";
import { initials } from "@/components/ui/display";
import { brandOf } from "../brand";
import { getDb } from "../db/client";
import { plans, type schools } from "../db/schema";
import { readLocalUpload } from "../storage";
import type { SchoolHeader } from "./documents";

/** The school's colour for its documents: its own on plans with school colours, School OS orange otherwise. */
export async function schoolAccent(school: typeof schools.$inferSelect) {
  if (!school.brandColor) return undefined;
  const [plan] = await getDb().select({ features: plans.features }).from(plans).where(eq(plans.key, school.planKey));
  return brandOf(school, plan?.features ?? []);
}

/** School letterhead for PDFs, with the logo read from local storage or Cloudinary. */
export async function schoolHeader(school: typeof schools.$inferSelect): Promise<SchoolHeader> {
  let logo: Buffer | string | null = null;
  if (school.logoUrl?.startsWith("/uploads/")) logo = (await readLocalUpload(school.logoUrl.replace("/uploads/", "").split("/")))?.bytes ?? null;
  else if (school.logoUrl?.startsWith("https://")) logo = school.logoUrl;
  return {
    name: school.name,
    address: [school.address, school.city, school.state].filter(Boolean).join(", ") || null,
    phone: school.phone,
    email: school.email,
    logo,
    initials: initials(school.name),
    accent: await schoolAccent(school),
  };
}

export function pdfDate(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : iso;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}

export function pdfResponse(pdf: Buffer, filename: string) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/[^\w.-]+/g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
