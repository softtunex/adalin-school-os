import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SchoolBrand } from "@/app/apply/[slug]/school-brand";
import { Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { KIND_LABEL, verifyDocument } from "@/lib/services/documents";

export const metadata: Metadata = { title: "Check a document", robots: { index: false, follow: false } };

/** What anyone sees when they scan the QR code on a school document. No login. */
export default async function VerifyPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const v = await verifyDocument(getDb(), slug, token);
  if (!v) notFound();
  const { school, doc, holderActive } = v;
  const state = !doc ? "unknown" : doc.revokedAt ? "revoked" : doc.kind === "id_card" && holderActive === false ? "inactive" : "valid";
  const look = {
    valid: { icon: "checkCircle", tone: "border-success/50 bg-success-wash text-success-deep", title: "This document is genuine" },
    revoked: { icon: "alert", tone: "border-danger/50 bg-danger-wash text-danger", title: "This document has been cancelled" },
    inactive: { icon: "alert", tone: "border-warning/50 bg-warning-wash text-warning-deep", title: "This card's holder has left the school" },
    unknown: { icon: "alert", tone: "border-danger/50 bg-danger-wash text-danger", title: "We can't find this document" },
  }[state] as { icon: "checkCircle" | "alert"; tone: string; title: string };
  return (
    <div className="min-h-dvh bg-paper px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-5">
        <SchoolBrand school={{ name: school.name, logoUrl: school.logoUrl, city: null, state: null }} caption="Document check" />
        <Card className={cn("flex items-start gap-3 border-2 p-5", look.tone)}>
          <Icon name={look.icon} size={28} className="shrink-0" />
          <div>
            <h1 className="fs-19 font-bold">{look.title}</h1>
            <p className="mt-1 fs-14.5 text-body">
              {state === "valid"
                ? `${school.name} issued it, and it hasn't been changed or cancelled.`
                : state === "revoked"
                  ? `${school.name} cancelled it${doc?.revokeReason ? `: ${doc.revokeReason}` : ""}. Don't accept it.`
                  : state === "inactive"
                    ? "The card was issued by the school, but its holder is no longer a current member."
                    : `${school.name} has no document with this code. If you were shown a paper with this code, it may be forged. Contact the school.`}
            </p>
          </div>
        </Card>
        {doc ? (
          <Card className="p-5">
            <dl className="grid gap-3 fs-14.5">
              {[
                ["Document", KIND_LABEL[doc.kind]],
                ["Issued to", doc.holderName],
                ["Title", doc.title],
                ["Serial number", doc.serial],
                ["Issued on", doc.issuedAt.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" })],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0 last:pb-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className={cn("text-right text-ink", k === "Serial number" ? "font-mono" : "font-medium")}>{val}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 fs-13 text-muted">Check that the name and serial number match the paper in front of you.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
