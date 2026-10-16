import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button-styles";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getStudentResults } from "@/lib/services/student-portal";

export const metadata: Metadata = { title: "Results" };

export default async function StudentResults() {
  const user = await requireUser();
  const r = await getStudentResults(getDb(), user.id);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="fs-26 font-bold tracking-[-0.02em]">Results</h1>
      <Card className="p-5">
        {!r.allowed ? (
          <EmptyState icon="results" title="Results come through your parents">
            Your school shares report cards with parents. Ask them, or your class teacher.
          </EmptyState>
        ) : r.results.length === 0 ? (
          <EmptyState icon="results" title="No results yet">
            Your report card shows here when the school publishes it.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {r.results.map((t) => (
              <li key={t.termId} className="flex flex-wrap items-center gap-3 py-3">
                <span className="grid size-10 place-items-center rounded-chunk bg-violet-wash text-violet">
                  <Icon name="results" size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block fs-15 font-semibold text-ink">
                    {t.termName}, {t.session}
                  </span>
                  <span className="block fs-13.5 text-muted">{t.className}</span>
                </span>
                {t.withheld ? (
                  <Badge tone="warning">Held by the school</Badge>
                ) : (
                  <a href={`/learn/report-card/${t.termId}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                    <Icon name="download" size={16} /> Report card
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
