import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { buttonClass } from "@/components/ui/button-styles";
import { Avatar, Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { appUrl, requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatWhen } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/money";
import { can } from "@/lib/services/access";
import { getApplicant, STATUS_LABEL, statusUrl } from "@/lib/services/admissions";
import { STATUS_TONE } from "../shared";
import { ApplicantActions } from "./applicant-actions";

export const metadata: Metadata = { title: "Applicant" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(`${dob}T12:00:00Z`);
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) years--;
  return years;
}

export default async function ApplicantPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const access = await requirePageAccess(slug, ["admissions:view"]);
  const d = await getApplicant(getDb(), access, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const a = d.a;
  const name = [a.firstName, a.middleName, a.lastName].filter(Boolean).join(" ");
  const years = age(a.dateOfBirth);
  const rows: [string, string | null][] = [
    ["Class applying for", d.levelName],
    ["Session", d.sessionName],
    ["Gender", a.gender === "female" ? "Girl" : "Boy"],
    ["Date of birth", a.dateOfBirth ? `${new Date(`${a.dateOfBirth}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}${years !== null ? ` (${years})` : ""}` : null],
    ["Previous school", a.previousSchool],
    ["Parent", `${a.guardianName} (${a.guardianRelationship})`],
    ["Phone", a.guardianPhone],
    ["Email", a.guardianEmail],
    ["Address", a.address],
    ["Form fee", a.feeKobo ? `${formatNaira(a.feeKobo)} · ${a.feePaid ? "paid" : "not paid"}` : "Free"],
    ["Entrance exam score", a.examScore === null ? null : String(a.examScore)],
  ];

  return (
    <>
      <Topbar title={name} context={`Admissions · ${a.ref}`} />
      <PageBody>
        <Link href={`/s/${slug}/admissions`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> Admissions
        </Link>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <Card className="flex flex-wrap items-center gap-4 p-5">
              <Avatar name={name} size={56} />
              <div className="min-w-0 flex-1">
                <h1 className="fs-20 font-semibold text-ink">{name}</h1>
                <p className="font-mono fs-13 text-muted">
                  {a.ref} · applied {formatWhen(a.createdAt)}
                </p>
              </div>
              <Badge tone={STATUS_TONE[a.status]} dot>
                {STATUS_LABEL[a.status]}
              </Badge>
            </Card>
            <Card className="p-0">
              <dl className="divide-y divide-line">
                {rows.map(([k, v]) => (
                  <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                    <dt className="fs-13.5 text-muted">{k}</dt>
                    <dd className="fs-14.5 text-ink">{v ?? <span className="text-muted">—</span>}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            {a.notes ? (
              <Card className="p-5">
                <h2 className="fs-14 font-semibold text-muted">Notes from the parent</h2>
                <p className="mt-1 whitespace-pre-wrap fs-15 text-body">{a.notes}</p>
              </Card>
            ) : null}
            {a.interviewNotes ? (
              <Card className="p-5">
                <h2 className="fs-14 font-semibold text-muted">Interview notes</h2>
                <p className="mt-1 whitespace-pre-wrap fs-15 text-body">{a.interviewNotes}</p>
              </Card>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {a.offeredAt && ["offered", "accepted", "enrolled"].includes(a.status) ? (
                <a href={`/s/${slug}/admissions/${a.id}/offer`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
                  <Icon name="download" size={16} /> Offer letter
                </a>
              ) : null}
              <a href={statusUrl(await appUrl(), slug, a.token)} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}>
                <Icon name="link" size={16} /> Parent&apos;s page
              </a>
            </div>
          </div>
          <ApplicantActions
            slug={slug}
            id={a.id}
            status={a.status}
            next={d.next}
            examScore={a.examScore}
            interviewNotes={a.interviewNotes}
            feeKobo={a.feeKobo}
            feePaid={a.feePaid}
            classOptions={d.classOptions}
            canManage={can(access, "admissions:manage")}
            canEnroll={can(access, "admissions:enroll") && can(access, "students:create")}
            studentHref={a.studentId ? `/s/${slug}/students/${a.studentId}` : null}
          />
        </div>
      </PageBody>
    </>
  );
}
