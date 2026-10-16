import { notFound } from "next/navigation";
import { renderOfferLetter } from "@/lib/admissions/offer-pdf";
import { appUrl } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { pdfResponse } from "@/lib/fees/school-header";
import { getApplicationStatus } from "@/lib/services/admissions";

/** The parent's copy of the offer letter, by the secret link. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const db = getDb();
  const s = await getApplicationStatus(db, slug, token);
  if (!s) notFound();
  const doc = await renderOfferLetter(db, s.page.school.id, s.a.id, await appUrl());
  if (!doc) notFound();
  return pdfResponse(doc.pdf, doc.filename);
}
