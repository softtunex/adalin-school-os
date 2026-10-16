import { notFound } from "next/navigation";
import { appUrl, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { renderInvoicePdf } from "@/lib/fees/invoice-pdf";
import { pdfResponse } from "@/lib/fees/school-header";
import { getInvoice } from "@/lib/services/invoices";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const access = await requireAccess(slug);
  try {
    // Checks the permission, the plan and that the invoice is this school's.
    await getInvoice(getDb(), access, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const out = await renderInvoicePdf(getDb(), access.school.id, id, await appUrl());
  if (!out) notFound();
  return pdfResponse(out.pdf, out.filename);
}
