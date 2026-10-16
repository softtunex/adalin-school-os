"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { saveElectivesAction } from "./actions";

type Props = {
  slug: string;
  classId: string;
  electives: { id: string; name: string; code: string | null }[];
  students: { id: string; firstName: string; lastName: string; admissionNo: string }[];
  initial: string[];
  editable: boolean;
};

export function ElectivesGrid({ slug, classId, electives, students, initial, editable }: Props) {
  const router = useRouter();
  const [picks, setPicks] = useState(() => new Set(initial));
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => Object.fromEntries(electives.map((e) => [e.id, students.filter((s) => picks.has(`${s.id}|${e.id}`)).length])), [electives, students, picks]);

  function toggle(k: string) {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setDirty(true);
    setState({});
  }

  function setColumn(subjectId: string, on: boolean) {
    setPicks((prev) => {
      const next = new Set(prev);
      for (const s of students) {
        if (on) next.add(`${s.id}|${subjectId}`);
        else next.delete(`${s.id}|${subjectId}`);
      }
      return next;
    });
    setDirty(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success && !dirty ? <Alert tone="success">{state.success}</Alert> : null}
      <div className="overflow-x-auto px-3 pb-3 sm:px-4">
        <table className="w-full border-separate border-spacing-0 text-[14px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[200px] rounded-l-[10px] bg-paper px-4 py-3 text-left text-[13.5px] font-medium text-muted">Student</th>
              {electives.map((e) => (
                <th key={e.id} className="min-w-[96px] bg-paper px-2 py-2 text-center text-[13px] font-medium text-muted last:rounded-r-[10px]" title={e.name}>
                  <span className="block truncate text-ink">{e.code ?? e.name}</span>
                  <span className="tabular block text-[12px]">{counts[e.id]} taking</span>
                  {editable ? (
                    <span className="mt-1 flex justify-center gap-1">
                      <button type="button" onClick={() => setColumn(e.id, true)} className="rounded-md px-1.5 text-[11.5px] font-medium text-blue hover:bg-blue-wash">
                        All
                      </button>
                      <button type="button" onClick={() => setColumn(e.id, false)} className="rounded-md px-1.5 text-[11.5px] font-medium text-muted hover:bg-sunken">
                        None
                      </button>
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="group hover:bg-paper">
                <td className="sticky left-0 z-10 border-b border-line bg-canvas px-4 py-2.5 group-hover:bg-paper">
                  <p className="font-medium text-ink">
                    {s.lastName} {s.firstName}
                  </p>
                  <p className="font-mono text-[12px] text-muted">{s.admissionNo}</p>
                </td>
                {electives.map((e) => {
                  const k = `${s.id}|${e.id}`;
                  return (
                    <td key={e.id} className="border-b border-line text-center">
                      <input
                        type="checkbox"
                        checked={picks.has(k)}
                        disabled={!editable}
                        onChange={() => toggle(k)}
                        aria-label={`${s.firstName} ${s.lastName} takes ${e.name}`}
                        className="size-5 accent-[var(--brand)]"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          {dirty ? <span className="text-[13.5px] text-muted">Unsaved changes</span> : null}
          <Button
            disabled={pending || !dirty}
            onClick={() =>
              startTransition(async () => {
                const list = [...picks].map((k) => {
                  const [studentId, subjectId] = k.split("|");
                  return { studentId, subjectId };
                });
                const result = await saveElectivesAction(slug, classId, list);
                setState(result);
                if (!result.error) {
                  setDirty(false);
                  router.refresh();
                }
              })
            }
          >
            <Icon name="check" size={17} />
            {pending ? "Saving…" : "Save electives"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
