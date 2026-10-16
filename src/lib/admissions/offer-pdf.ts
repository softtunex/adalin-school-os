import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq } from "drizzle-orm";
import { createElement } from "react";
import type { DB } from "../db/client";
import { membershipRoles, memberships, roles, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { OfferLetterPdf } from "../fees/documents";
import { pdfDate, schoolHeader } from "../fees/school-header";
import { offerLetterData, statusUrl } from "../services/admissions";

/** The offer letter PDF. One builder for the school's copy and the parent's. Callers authorise first. */
export async function renderOfferLetter(db: DB, schoolId: string, applicantId: string, baseUrl: string) {
  const d = await offerLetterData(db, schoolId, applicantId);
  if (!d) return null;
  const [principal] = await withTenant(db, schoolId, (tx) =>
    tx
      .select({ name: users.name })
      .from(memberships)
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(roles.key, "principal"), eq(memberships.status, "active")))
      .limit(1),
  );
  const pdf = await renderToBuffer(
    createElement(OfferLetterPdf, {
      doc: {
        school: await schoolHeader(d.school),
        ref: d.a.ref,
        date: pdfDate(d.a.offeredAt!),
        child: d.child,
        guardian: d.a.guardianName,
        address: d.a.address,
        level: d.levelName ?? "the class applied for",
        session: d.sessionName,
        examScore: d.a.examScore,
        acceptBy: pdfDate(d.acceptBy),
        statusUrl: statusUrl(baseUrl, d.school.slug, d.a.token),
        principal: principal?.name ?? null,
      },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  return { pdf, filename: `Offer-${d.a.ref.replace(/\//g, "-")}-${d.a.lastName}` };
}
