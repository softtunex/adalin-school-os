import "server-only";
import { initials } from "@/components/ui/display";
import type { schools } from "../db/schema";
import { readLocalUpload } from "../storage";
import type { SchoolHeader } from "./documents";

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
