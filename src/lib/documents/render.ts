import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { createElement } from "react";
import { initials } from "@/components/ui/display";
import type { DB } from "../db/client";
import { guardians, issuedDocuments, studentGuardians, students, type schools } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { pdfDate, schoolHeader } from "../fees/school-header";
import { documentSettings } from "../services/documents";
import { readLocalUpload } from "../storage";
import { CertificatesPdf, IdCardsPdf, LettersPdf, TestimonialPdf, TranscriptPdf, type TranscriptBlock, type Verify } from "./pdf";

type Doc = typeof issuedDocuments.$inferSelect;

export function verifyUrl(baseUrl: string, slug: string, token: string) {
  return `${baseUrl}/verify/${slug}/${token}`;
}

async function verifyFor(baseUrl: string, slug: string, d: Doc): Promise<Verify> {
  const url = verifyUrl(baseUrl, slug, d.token);
  return { url, serial: d.serial, qr: await QRCode.toDataURL(url, { margin: 0, width: 240, errorCorrectionLevel: "M" }) };
}

async function photo(url: string | null) {
  if (!url) return null;
  if (url.startsWith("/uploads/")) return (await readLocalUpload(url.replace("/uploads/", "").split("/")))?.bytes ?? null;
  return url.startsWith("https://") ? url : null;
}

/**
 * Draws documents from what was recorded when they were issued, so a reprint matches the
 * original exactly. Documents in one request are all the same kind (one batch, or one id).
 */
export async function renderDocuments(db: DB, school: typeof schools.$inferSelect, baseUrl: string, pick: { id?: string; batch?: string }) {
  const docs = await withTenant(db, school.id, (tx) =>
    tx
      .select()
      .from(issuedDocuments)
      .where(pick.id ? eq(issuedDocuments.id, pick.id) : eq(issuedDocuments.batch, pick.batch!))
      .orderBy(issuedDocuments.serial),
  );
  if (!docs.length) throw new AppError("Those documents weren't found.", "not_found");
  const kind = docs[0].kind;
  const header = await schoolHeader(school);
  const s = documentSettings(school.documentSettings);
  const signs = await Promise.all(s.signatories.map(async (x) => ({ name: x.name, title: x.title, signature: await photo(x.signatureUrl ?? null) })));
  const verify = await Promise.all(docs.map((d) => verifyFor(baseUrl, school.slug, d)));
  let element;
  if (kind === "id_card") {
    const ids = docs.map((d) => d.studentId).filter((x): x is string => !!x);
    const [photos, contacts] = ids.length
      ? await withTenant(db, school.id, (tx) =>
          Promise.all([
            tx.select({ id: students.id, url: students.photoUrl }).from(students).where(inArray(students.id, ids)),
            tx
              .select({ studentId: studentGuardians.studentId, name: guardians.name, phone: guardians.phone })
              .from(studentGuardians)
              .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
              .where(inArray(studentGuardians.studentId, ids)),
          ]),
        )
      : [[], []];
    const cards = await Promise.all(
      docs.map(async (d, i) => {
        const data = d.data as { session: string; admissionNo?: string; className?: string | null; role?: string; blood?: string };
        const lines: [string, string][] = d.studentId
          ? [
              ["Adm. no", data.admissionNo ?? ""],
              ["Class", data.className ?? "—"],
              ...(data.blood ? ([["Blood", data.blood]] as [string, string][]) : []),
            ]
          : [["Role", data.role ?? "Staff"]];
        const parent = contacts.find((c) => c.studentId === d.studentId && c.phone);
        return {
          holderName: d.holderName,
          photo: await photo(photos.find((p) => p.id === d.studentId)?.url ?? null),
          initials: initials(d.holderName),
          lines,
          kind: d.studentId ? "Student" : "Staff",
          emergency: parent ? `${parent.name}, ${parent.phone}` : (header.phone ? `The school, ${header.phone}` : null),
          verify: verify[i],
        };
      }),
    );
    element = createElement(IdCardsPdf, { school: header, session: (docs[0].data as { session: string }).session, note: s.cardNote, cards, sign: signs[0] ?? null });
  } else if (kind === "testimonial") {
    const d = docs[0].data as Record<string, string>;
    element = createElement(TestimonialPdf, {
      d: {
        school: header,
        name: docs[0].holderName,
        admissionNo: d.admissionNo,
        gender: d.gender,
        dateOfBirth: d.dateOfBirth ? pdfDate(d.dateOfBirth) : null,
        yearsFrom: d.yearsFrom,
        yearsTo: d.yearsTo,
        lastClass: d.lastClass,
        conduct: d.conduct,
        offices: d.offices ?? "",
        activities: d.activities ?? "",
        remark: d.remark,
        date: pdfDate(docs[0].issuedAt),
        signs,
        verify: verify[0],
      },
    });
  } else if (kind === "transcript") {
    const d = docs[0].data as { admissionNo: string; className: string | null; blocks: TranscriptBlock[] };
    element = createElement(TranscriptPdf, { d: { school: header, name: docs[0].holderName, admissionNo: d.admissionNo, className: d.className, blocks: d.blocks, date: pdfDate(docs[0].issuedAt), signs, verify: verify[0] } });
  } else if (kind === "certificate") {
    element = createElement(CertificatesPdf, {
      school: header,
      date: pdfDate(docs[0].issuedAt),
      signs,
      docs: docs.map((d, i) => {
        const data = d.data as { heading: string; body: string };
        return { name: d.holderName, heading: data.heading, body: data.body, verify: verify[i] };
      }),
    });
  } else {
    element = createElement(LettersPdf, {
      school: header,
      date: pdfDate(docs[0].issuedAt),
      sign: signs[0],
      docs: docs.map((d, i) => {
        const data = d.data as { heading: string; body: string; parent: string };
        return { to: data.parent, heading: data.heading, body: data.body, verify: verify[i] };
      }),
    });
  }
  const pdf = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  const name = docs.length === 1 ? `${kind}-${docs[0].serial}` : `${kind}s-${docs.length}`;
  return { pdf, filename: name };
}
