import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, initials } from "@/components/ui/display";
import { Icon, type IconName } from "@/components/ui/icons";
import { brandStyle } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { lagosClock } from "@/lib/services/hr";
import { KIND_LABEL, verifyDocument } from "@/lib/services/documents";

export const metadata: Metadata = { title: "Check a document", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type State = "valid" | "revoked" | "inactive" | "unknown";

const LOOK: Record<State, { icon: IconName; ring: string; chip: string; label: string; title: string }> = {
  valid: { icon: "checkCircle", ring: "bg-success text-white", chip: "bg-success-wash text-success-deep", label: "Genuine", title: "This document is genuine" },
  revoked: { icon: "x", ring: "bg-danger text-white", chip: "bg-danger-wash text-danger", label: "Cancelled", title: "This document has been cancelled" },
  inactive: { icon: "alert", ring: "bg-warning text-white", chip: "bg-warning-wash text-warning-deep", label: "No longer current", title: "This card's holder has left the school" },
  unknown: { icon: "alert", ring: "bg-danger text-white", chip: "bg-danger-wash text-danger", label: "Not found", title: "We can't find this document" },
};

const ABOUT: Record<string, string> = {
  id_card: "An identity card the school printed for this person.",
  testimonial: "A testimonial the school wrote for a student leaving the school.",
  certificate: "A certificate the school awarded.",
  transcript: "The student's published results, as recorded by the school.",
  letter: "A letter the school sent.",
};

function day(d: Date) {
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}

/** What anyone sees when they scan the QR code on a school document. No login. */
export default async function VerifyPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const v = await verifyDocument(getDb(), slug, token);
  if (!v) notFound();
  const { school, doc, holderActive } = v;
  const state: State = !doc ? "unknown" : doc.revokedAt ? "revoked" : doc.kind === "id_card" && holderActive === false ? "inactive" : "valid";
  const look = LOOK[state];
  const now = new Date();
  const data = (doc?.data ?? {}) as { session?: string; className?: string | null; admissionNo?: string; role?: string };
  const details: [string, string][] = doc
    ? [
        ["Document", KIND_LABEL[doc.kind]],
        ["Title", doc.title],
        ...(data.admissionNo ? ([["Admission number", data.admissionNo]] as [string, string][]) : []),
        ...(doc.kind === "id_card" && data.className ? ([["Class", data.className]] as [string, string][]) : []),
        ...(doc.kind === "id_card" && data.role ? ([["Role", data.role]] as [string, string][]) : []),
        ...(doc.kind === "id_card" && data.session ? ([["Valid for", `${data.session} session`]] as [string, string][]) : []),
        ["Serial number", doc.serial],
        ["Issued on", day(doc.issuedAt)],
        ...(doc.revokedAt ? ([["Cancelled on", day(doc.revokedAt)]] as [string, string][]) : []),
      ]
    : [];
  const advice =
    state === "valid"
      ? ["Check that the name and serial number below match the paper in front of you.", "If they match, the school issued this document and hasn't cancelled it."]
      : state === "revoked"
        ? ["Don't accept this document.", `${school.name} cancelled it${doc?.revokeReason ? `: “${doc.revokeReason}”` : ""}. A replacement may have been issued; ask the holder or the school.`]
        : state === "inactive"
          ? ["The card is real, but its holder is no longer a current student or member of staff.", "Don't admit them on the strength of this card. Contact the school if you need to confirm."]
          : ["The school has no document with this code.", "If you were shown a paper with this QR code, it may be forged. Contact the school before you rely on it."];

  return (
    <div className="min-h-dvh bg-paper" style={brandStyle(school.accent)}>
      <header className="bg-brand px-4 pb-16 pt-6 text-white">
        <div className="mx-auto flex w-full max-w-[600px] items-center gap-3">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="size-12 rounded-full border-2 border-white/70 bg-white object-cover" />
          ) : (
            <span className="grid size-12 place-items-center rounded-full border-2 border-white/70 bg-white/15 fs-17 font-bold">{initials(school.name)}</span>
          )}
          <div className="min-w-0">
            <p className="truncate fs-18 font-bold">{school.name}</p>
            <p className="fs-13.5 opacity-85">Document check</p>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-10 flex w-full max-w-[600px] flex-col gap-4 px-4 pb-10">
        <section className="flex flex-col items-center gap-3 rounded-[20px] border border-line bg-canvas px-5 py-7 text-center shadow-card">
          <span className={cn("grid size-16 place-items-center rounded-full shadow-[0_4px_0_rgba(0,0,0,0.12)]", look.ring)}>
            <Icon name={look.icon} size={34} strokeWidth={2.6} />
          </span>
          <span className={cn("rounded-full px-3 py-1 fs-12.5 font-bold uppercase tracking-wider", look.chip)}>{look.label}</span>
          <h1 className="fs-22 font-bold text-ink">{look.title}</h1>
          <p className="fs-13.5 text-muted">
            Checked {day(now)} at {lagosClock(now)}
          </p>
        </section>

        {doc ? (
          <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-canvas p-5 shadow-card">
            <div className="flex items-center gap-3">
              <Avatar name={doc.holderName} size={48} />
              <div className="min-w-0">
                <p className="fs-13 text-muted">Issued to</p>
                <p className="truncate fs-18 font-bold text-ink">{doc.holderName}</p>
              </div>
            </div>
            <p className="fs-14 text-body">{ABOUT[doc.kind]}</p>
            <dl className="flex flex-col divide-y divide-line rounded-chunk border border-line">
              {details.map(([k, val]) => (
                <div key={k} className="flex justify-between gap-4 px-3.5 py-2.5 fs-14.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className={cn("text-right text-ink", k === "Serial number" ? "font-mono font-semibold" : "font-medium")}>{val}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-canvas p-5 shadow-card">
          <h2 className="fs-16 font-semibold text-ink">What to do</h2>
          <ul className="flex flex-col gap-1.5">
            {advice.map((a) => (
              <li key={a} className="flex gap-2 fs-14.5 text-body">
                <Icon name="chevronRight" size={16} className="mt-1 shrink-0 text-brand" />
                {a}
              </li>
            ))}
          </ul>
        </section>

        {school.phone || school.email || school.address ? (
          <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-canvas p-5 shadow-card">
            <h2 className="fs-16 font-semibold text-ink">Contact {school.name}</h2>
            <div className="flex flex-col gap-2 fs-14.5">
              {school.phone ? (
                <a href={`tel:${school.phone.replace(/\s/g, "")}`} className="flex items-center gap-2.5 font-semibold text-brand-ink hover:underline">
                  <Icon name="phone" size={17} /> {school.phone}
                </a>
              ) : null}
              {school.email ? (
                <a href={`mailto:${school.email}`} className="flex items-center gap-2.5 font-semibold text-brand-ink hover:underline">
                  <Icon name="send" size={17} /> {school.email}
                </a>
              ) : null}
              {school.address ? (
                <p className="flex items-start gap-2.5 text-body">
                  <Icon name="home" size={17} className="mt-0.5 shrink-0 text-muted" /> {school.address}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <p className="px-2 text-center fs-12.5 text-muted">This check reads the school&apos;s own register of documents, kept on School OS. It changes the moment the school cancels a document.</p>
      </main>
    </div>
  );
}
