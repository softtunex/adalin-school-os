import type { ReactNode } from "react";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import type { sickBayVisits, studentHealth } from "@/lib/db/schema";
import { formatTemp, OUTCOME_LABEL } from "@/lib/services/health";
import { lagosClock } from "@/lib/services/hr";

type Record = typeof studentHealth.$inferSelect | null;
type Visit = typeof sickBayVisits.$inferSelect;

const OUTCOME_TONE = { returned: "success", rested: "blue", sent_home: "warning", referred: "danger" } as const;

function when(d: Date) {
  return `${d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" })}, ${lagosClock(d)}`;
}

/** A student's health record and sick bay visits, for staff (with an edit form) and parents. */
export function HealthPanel({ record, visits, name, editor }: { record: Record; visits: Visit[]; name: string; editor?: ReactNode }) {
  const closed = visits.filter((v) => v.leftAt);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="fs-16 font-semibold">Health record</h2>
        {editor ?? (
          <dl className="grid gap-x-6 gap-y-3 fs-14.5 sm:grid-cols-2">
            <div>
              <dt className="text-muted">Allergies</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {record?.allergies.length
                  ? record.allergies.map((a) => (
                      <Badge key={a} tone="danger">
                        {a}
                      </Badge>
                    ))
                  : <span className="text-body">None recorded</span>}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Conditions</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {record?.conditions.length
                  ? record.conditions.map((c) => (
                      <Badge key={c} tone="warning">
                        {c}
                      </Badge>
                    ))
                  : <span className="text-body">None recorded</span>}
              </dd>
            </div>
            {record?.regularMedication ? (
              <div>
                <dt className="text-muted">Regular medication</dt>
                <dd className="text-ink">{record.regularMedication}</dd>
              </div>
            ) : null}
            {record?.emergencyNote ? (
              <div>
                <dt className="text-muted">In an emergency</dt>
                <dd className="text-ink">{record.emergencyNote}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="fs-16 font-semibold">Sick bay visits</h2>
        {closed.length === 0 ? (
          <EmptyState icon="health" title="No visits">
            {name} hasn&apos;t been to the sick bay.
          </EmptyState>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {closed.map((v) => (
              <li key={v.id} className="flex flex-col gap-1 py-3">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="fs-15 font-semibold text-ink">{v.complaint}</span>
                  {v.outcome ? <Badge tone={OUTCOME_TONE[v.outcome]}>{OUTCOME_LABEL[v.outcome]}</Badge> : null}
                </span>
                <span className="fs-13.5 text-muted">
                  {when(v.arrivedAt)}
                  {v.temperature ? ` · ${formatTemp(v.temperature)}` : ""}
                </span>
                {v.treatment ? <span className="fs-14 text-body">{v.treatment}</span> : null}
                {v.medicines.length ? <span className="fs-14 text-body">Given: {v.medicines.map((m) => `${m.medicine} ${m.dose}`).join(", ")}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
