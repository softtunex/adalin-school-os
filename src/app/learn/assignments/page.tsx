import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatDue } from "@/lib/dates";
import { getStudentAssignments } from "@/lib/services/assignments";
import { HOMEWORK_STATUS } from "./status";

export const metadata: Metadata = { title: "Homework" };

export default async function StudentHomework() {
  const user = await requireUser();
  const { rows } = await getStudentAssignments(getDb(), user.id);
  const groups = [
    { title: "To do", items: rows.filter((r) => r.status === "to_do" || r.status === "overdue") },
    { title: "Handed in", items: rows.filter((r) => r.status === "handed_in").reverse() },
    { title: "Marked", items: rows.filter((r) => r.status === "marked").reverse() },
    { title: "Missed", items: rows.filter((r) => r.status === "missed").reverse() },
  ].filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="fs-26 font-bold tracking-[-0.02em]">Homework</h1>
      {groups.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon="clipboard" title="No homework yet">
            When your teachers set work, it shows here with the due date. You can hand it in from your phone.
          </EmptyState>
        </Card>
      ) : null}
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-2.5">
          <h2 className="fs-15 font-bold text-muted">
            {g.title} <span className="tabular font-semibold">· {g.items.length}</span>
          </h2>
          <ul className="flex flex-col gap-2.5">
            {g.items.map((r) => {
              const st = HOMEWORK_STATUS[r.status];
              return (
                <li key={r.a.id}>
                  <Link
                    href={`/learn/assignments/${r.a.id}`}
                    className="flex items-center gap-3.5 rounded-chunk border-2 border-line bg-canvas p-4 shadow-[0_3px_0_var(--line)] transition hover:border-brand/50 active:translate-y-[2px] active:shadow-none"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-chunk bg-brand-wash text-brand">
                      <Icon name="clipboard" size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block fs-13 font-semibold text-muted">{r.subjectName}</span>
                      <span className="block truncate fs-16 font-bold text-ink">{r.a.title}</span>
                      <span className="block fs-13.5 text-muted">
                        {r.status === "marked" && r.sub?.score != null && r.a.maxScore ? `Scored ${r.sub.score} / ${r.a.maxScore}` : `Due ${formatDue(r.a.dueAt)}`}
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
