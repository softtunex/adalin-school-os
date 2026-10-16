import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatDue } from "@/lib/dates";
import { getStudentExams } from "@/lib/services/cbt";
import { STUDENT_EXAM } from "./status";

export const metadata: Metadata = { title: "Exams" };

export default async function StudentExams() {
  const user = await requireUser();
  const { rows } = await getStudentExams(getDb(), user.id);
  const groups = [
    { title: "Now", items: rows.filter((r) => r.status === "open" || r.status === "in_progress") },
    { title: "Coming up", items: rows.filter((r) => r.status === "upcoming") },
    { title: "Done", items: rows.filter((r) => r.status === "done" || r.status === "missed").reverse() },
  ].filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="fs-26 font-bold tracking-[-0.02em]">Exams</h1>
      {groups.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon="monitor" title="No exams yet">
            When your teachers set a computer-based test, it shows here with the time it opens.
          </EmptyState>
        </Card>
      ) : null}
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-2.5">
          <h2 className="fs-15 font-bold text-muted">{g.title}</h2>
          <ul className="flex flex-col gap-2.5">
            {g.items.map((r) => {
              const st = STUDENT_EXAM[r.status];
              return (
                <li key={r.e.id}>
                  <Link
                    href={`/learn/exams/${r.e.id}`}
                    className="flex items-center gap-3.5 rounded-chunk border-2 border-line bg-canvas p-4 shadow-[0_3px_0_var(--line)] transition hover:border-brand/50 active:translate-y-[2px] active:shadow-none"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-chunk bg-violet-wash text-violet">
                      <Icon name="monitor" size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block fs-13 font-semibold text-muted">{r.subjectName}</span>
                      <span className="block truncate fs-16 font-bold text-ink">{r.e.title}</span>
                      <span className="block fs-13.5 text-muted">
                        {r.status === "upcoming" ? `Opens ${formatDue(r.e.opensAt)}` : r.status === "open" || r.status === "in_progress" ? `Closes ${formatDue(r.e.closesAt)} · ${r.e.durationMins} min` : `${r.e.durationMins} min`}
                      </span>
                    </span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
