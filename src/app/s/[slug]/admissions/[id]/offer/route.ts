import { notFound } from "next/navigation";
import { renderOfferLetter } from "@/lib/admissions/offer-pdf";
import { appUrl, requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { pdfResponse } from "@/lib/fees/school-header";

/** The school's copy of an offer letter. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const access = await requirePageAccess(slug, ["admissions:view"]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const doc = await renderOfferLetter(getDb(), access.school.id, id, await appUrl());
  if (!doc) notFound();
  return pdfResponse(doc.pdf, doc.filename);
}
