import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState } from "@/components/ui/display";
import { Icon, type IconName } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatWhen } from "@/lib/dates";
import { getStudentMaterials } from "@/lib/services/materials";

export const metadata: Metadata = { title: "Materials" };

const ICON: Record<string, { icon: IconName; label: string; tone: string }> = {
  file: { icon: "file", label: "File", tone: "bg-blue-wash text-blue" },
  link: { icon: "link", label: "Link", tone: "bg-violet-wash text-violet" },
  video: { icon: "monitor", label: "Video", tone: "bg-danger-wash text-danger" },
  note: { icon: "edit", label: "Note", tone: "bg-success-wash text-success" },
};

export default async function StudentMaterials() {
  const user = await requireUser();
  const { groups } = await getStudentMaterials(getDb(), user.id);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="fs-26 font-bold tracking-[-0.02em]">Materials</h1>
      {groups.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon="layers" title="Nothing here yet">
            Notes, slides and videos your teachers share for your class show up here.
          </EmptyState>
        </Card>
      ) : null}
      {groups.map((g) => (
        <section key={g.subject} className="flex flex-col gap-2.5">
          <h2 className="fs-15 font-bold text-muted">
            {g.subject} <span className="tabular font-semibold">· {g.items.length}</span>
          </h2>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {g.items.map(({ m, youtube }) => {
              const k = ICON[youtube ? "video" : m.kind];
              return (
                <li key={m.id}>
                  <Link
                    href={`/learn/materials/${m.id}`}
                    className="flex h-full items-center gap-3.5 rounded-chunk border-2 border-line bg-canvas p-4 shadow-[0_3px_0_var(--line)] transition hover:border-brand/50 active:translate-y-[2px] active:shadow-none"
                  >
                    <span className={`grid size-11 shrink-0 place-items-center rounded-chunk ${k.tone}`}>
                      <Icon name={k.icon} size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate fs-16 font-bold text-ink">{m.title}</span>
                      <span className="block truncate fs-13.5 text-muted">
                        {k.label} · {formatWhen(m.createdAt)}
                      </span>
                    </span>
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
