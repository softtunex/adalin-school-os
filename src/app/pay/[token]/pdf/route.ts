import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { appUrl } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";
import { renderInvoicePdf } from "@/lib/fees/invoice-pdf";
import { pdfResponse } from "@/lib/fees/school-header";

/** The invoice as a PDF for whoever holds the pay link (parents, from the app, SMS or email). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const [inv] = await getDb().select({ id: invoices.id, schoolId: invoices.schoolId }).from(invoices).where(eq(invoices.payToken, token));
  if (!inv) notFound();
  const out = await renderInvoicePdf(getDb(), inv.schoolId, inv.id, await appUrl());
  if (!out) notFound();
  return pdfResponse(out.pdf, out.filename);
}
