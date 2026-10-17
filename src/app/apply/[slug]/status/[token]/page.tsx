import type { Metadata } from "next";
import { brandStyle } from "@/lib/brand";
import { notFound } from "next/navigation";
import { Kola } from "@/components/illustrations/art";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { formatWhen } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { getApplicationStatus } from "@/lib/services/admissions";
import { SchoolBrand } from "../../school-brand";
import { OfferResponse, PayFee } from "./status-client";

export const metadata: Metadata = { title: "Your application", robots: { index: false, follow: false } };

type SP = { new?: string; paid?: string; cancelled?: string; failed?: string; accepted?: string; declined?: string };

const ASSESS_STEP: Record<string, string> = { exam: "Entrance exam", interview: "Interview", both: "Entrance exam and interview" };

/** The steps this school uses: the assessment step only appears when the school assesses applicants. */
function stepsFor(assessment: string) {
  const steps: { key: string; label: string }[] = [{ key: "applied", label: "Application received" }];
  if (assessment !== "none") steps.push({ key: "assess", label: ASSESS_STEP[assessment] ?? ASSESS_STEP.both });
  steps.push({ key: "offered", label: "Offer of admission" }, { key: "accepted", label: "Offer accepted" }, { key: "enrolled", label: "Enrolled" });
  return steps;
}

function stepIndex(steps: { key: string }[], status: string) {
  const key = status === "exam" || status === "interview" ? "assess" : status;
  return Math.max(0, steps.findIndex((s) => s.key === key));
}

export default async function StatusPage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<SP> }) {
  const { slug, token } = await params;
  const sp = await searchParams;
  const s = await getApplicationStatus(getDb(), slug, token);
  if (!s) notFound();
  const { a, page } = s;
  const ended = a.status === "rejected" || a.status === "withdrawn";
  const STEPS = stepsFor(page.assessment);
  const at = stepIndex(STEPS, a.status);
  const child = `${a.firstName} ${a.lastName}`;
  const base = `/apply/${slug}/status/${token}`;

  return (
    <div className="min-h-dvh bg-paper px-4 py-8 sm:py-12" style={brandStyle(page.school.accent)}>
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
        <SchoolBrand school={page.school} caption="Admissions" />

        {sp.new ? (
          <Card className="flex items-center gap-4 border-success/40 p-5">
            <Kola wave className="h-20 w-auto shrink-0" />
            <div>
              <h1 className="fs-20 font-bold text-ink">Application sent!</h1>
              <p className="fs-14.5 text-body">
                Save this page. It&apos;s how you follow {a.firstName}&apos;s application{a.guardianEmail ? ", and we've emailed you the link" : ""}.
              </p>
            </div>
          </Card>
        ) : null}
        {sp.paid ? <Alert tone="success">Application fee received. Thank you.</Alert> : null}
        {sp.cancelled || sp.failed ? <Alert tone="warning">The payment didn&apos;t go through. You haven&apos;t been charged.</Alert> : null}
        {sp.accepted ? <Alert tone="success">Offer accepted. The school will be in touch about registration and resumption.</Alert> : null}

        <Card className="flex flex-col gap-1 p-5">
          <p className="fs-13 font-semibold uppercase tracking-[0.06em] text-muted">Application {a.ref}</p>
          <h2 className="fs-22 font-bold text-ink">{child}</h2>
          <p className="fs-14.5 text-muted">
            {s.levelName ?? "—"}
            {s.sessionName ? ` · ${s.sessionName}` : ""} · Applied {formatWhen(a.createdAt)}
          </p>
        </Card>

        {ended ? (
          <Card className="p-5">
            <h3 className="fs-17 font-bold">{a.status === "rejected" ? "Not successful this time" : "Application closed"}</h3>
            <p className="mt-1 fs-15 text-body">
              {a.status === "rejected"
                ? `We're sorry, ${page.school.name} can't offer ${a.firstName} a place this time. Thank you for applying.`
                : "This application has been withdrawn."}
            </p>
          </Card>
        ) : (
          <Card className="p-5">
            <ol className="flex flex-col">
              {STEPS.map((step, i) => {
                const done = i < at || (i === at && a.status === "enrolled");
                const current = i === at && !done;
                return (
                  <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full border-2 fs-13 font-bold",
                          done ? "border-success bg-success text-white" : current ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong text-muted",
                        )}
                      >
                        {done ? <Icon name="check" size={15} strokeWidth={3} /> : i + 1}
                      </span>
                      {i < STEPS.length - 1 ? <span className={cn("w-0.5 flex-1 min-h-5", done ? "bg-success" : "bg-line")} /> : null}
                    </div>
                    <div className="pb-4 pt-1">
                      <p className={cn("fs-15 font-semibold", current ? "text-ink" : done ? "text-body" : "text-muted")}>{step.label}</p>
                      {current && step.key === "assess" ? (
                        <p className="fs-14 text-body">{a.status === "exam" ? page.examInfo || "The school will tell you the date and venue." : "The school will contact you with the time."}</p>
                      ) : null}
                      {current && step.key === "applied" ? <p className="fs-14 text-body">The school is reviewing the application.</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        {!a.feePaid && a.feeKobo > 0 && !ended ? (
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="fs-17 font-bold">Application fee</h3>
              <span className="tabular fs-19 font-bold text-ink">{formatNaira(a.feeKobo)}</span>
            </div>
            {page.payOnline ? (
              <PayFee slug={slug} token={token} email={a.guardianEmail} amount={formatNaira(a.feeKobo)} />
            ) : (
              <p className="fs-14.5 text-body">Please pay at the school&apos;s office and quote {a.ref}.</p>
            )}
          </Card>
        ) : a.feeKobo > 0 ? (
          <p className="flex items-center gap-1.5 fs-14 text-success-deep">
            <Icon name="checkCircle" size={17} /> Application fee of {formatNaira(a.feeKobo)} paid
          </p>
        ) : null}

        {a.status === "offered" ? (
          <Card className="flex flex-col gap-4 border-success/40 p-5">
            <div>
              <h3 className="fs-19 font-bold text-ink">Congratulations! {a.firstName} has been offered a place.</h3>
              {s.acceptBy ? <p className="mt-1 fs-14.5 text-body">Please accept by {s.acceptBy.toLocaleDateString("en-NG", { day: "numeric", month: "long", timeZone: "Africa/Lagos" })}.</p> : null}
            </div>
            <a href={`${base}/offer`} target="_blank" rel="noopener" className={buttonClass("secondary", "md", "self-start")}>
              <Icon name="download" size={17} /> Offer letter (PDF)
            </a>
            <OfferResponse slug={slug} token={token} />
          </Card>
        ) : null}
        {a.status === "accepted" || a.status === "enrolled" ? (
          <Card className="flex flex-col gap-3 p-5">
            <p className="fs-15 text-body">{a.status === "enrolled" ? `${a.firstName} is now a student at ${page.school.name}. Welcome!` : "You've accepted the offer. The school will complete registration."}</p>
            <a href={`${base}/offer`} target="_blank" rel="noopener" className={buttonClass("secondary", "md", "self-start")}>
              <Icon name="download" size={17} /> Offer letter (PDF)
            </a>
          </Card>
        ) : null}

        <p className="text-center fs-13 text-muted">
          Questions? Contact {page.school.name}
          {page.school.phone ? ` on ${page.school.phone}` : ""}
          {page.school.email ? ` or ${page.school.email}` : ""}.
        </p>
      </div>
    </div>
  );
}
