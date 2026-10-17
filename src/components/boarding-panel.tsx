import { CancelExeatButton, RequestExeatButton } from "@/app/p/children/[id]/hostel-parts";
import { Badge, Card } from "@/components/ui/display";
import type { getChildBoarding } from "@/lib/services/hostel";
import { EXEAT_KIND_LABEL, EXEAT_STATUS_LABEL, when } from "@/lib/services/hostel";

type Boarding = NonNullable<Awaited<ReturnType<typeof getChildBoarding>>>;

const TONE = { pending: "warning", approved: "blue", declined: "danger", out: "violet", back: "success", cancelled: "neutral" } as const;

/** A parent's view of their child's boarding: where they sleep, the warden, and exeats. */
export function BoardingPanel({ data, studentId, name }: { data: Boarding; studentId: string; name: string }) {
  const open = data.exeats.some((e) => e.status === "pending" || e.status === "approved" || e.status === "out");
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <p className="fs-13 font-semibold uppercase tracking-[0.05em] text-muted">{data.hostel}</p>
        <p className="fs-18 font-bold text-ink">
          {data.room}, bed {data.b.bed}
        </p>
        {data.warden ? (
          <p className="fs-14.5 text-body">
            Warden: {data.warden}
            {data.wardenPhone ? <span className="ml-2 text-muted">{data.wardenPhone}</span> : null}
          </p>
        ) : null}
      </Card>
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="fs-16 font-semibold">Exeats</h2>
          {data.canRequest && !open ? <RequestExeatButton studentId={studentId} name={name} minDate={data.today} /> : null}
        </div>
        {!data.canRequest ? <p className="fs-14 text-muted">The school arranges exeats in person. Call the warden.</p> : null}
        {data.exeats.length === 0 ? (
          <p className="fs-14.5 text-muted">No exeats yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {data.exeats.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 py-3">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="fs-15 font-semibold text-ink">{EXEAT_KIND_LABEL[e.kind]}</span>
                  <span className="flex items-center gap-1">
                    <Badge tone={TONE[e.status]}>{EXEAT_STATUS_LABEL[e.status]}</Badge>
                    {(e.status === "pending" || e.status === "approved") && !e.requestedByStaff ? <CancelExeatButton studentId={studentId} exeatId={e.id} /> : null}
                  </span>
                </span>
                <span className="fs-13.5 text-muted">
                  {when(e.leaveAt)} to {when(e.returnBy)}
                </span>
                <span className="fs-14 text-body">{e.reason}</span>
                {e.decisionNote ? <span className="fs-14 text-body">The school said: {e.decisionNote}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
