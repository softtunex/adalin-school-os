"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { initialFormState } from "@/lib/form-state";
import { startExamAction } from "../../actions";

export function StartExam({ examId, resume }: { examId: string; resume: boolean }) {
  const [state, action, pending] = useActionState(() => startExamAction(examId), initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="lg" disabled={pending}>
        <Icon name="monitor" size={19} /> {pending ? "Opening…" : resume ? "Continue the exam" : "Start the exam"}
      </Button>
    </form>
  );
}
