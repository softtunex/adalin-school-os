"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { startConversationAction } from "../../actions";

export function NewMessageForm({ kids, defaultStudent }: { kids: { id: string; label: string }[]; defaultStudent: string }) {
  const router = useRouter();
  const [state, action] = useActionState(startConversationAction, initialFormState);
  useEffect(() => {
    if (state.data?.conversationId) router.replace(`/p/messages/${state.data.conversationId}`);
  }, [state.data?.conversationId, router]);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <p className="fs-14.5 text-muted">Your message goes to your child&apos;s class teacher. The school&apos;s leadership can see conversations too.</p>
      <Field label="About" htmlFor="msg-student">
        <Select id="msg-student" name="studentId" defaultValue={state.values?.studentId ?? defaultStudent}>
          {kids.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subject" htmlFor="msg-subject">
        <Input id="msg-subject" name="subject" required maxLength={120} defaultValue={state.values?.subject} placeholder="e.g. Absence on Monday" />
      </Field>
      <Field label="Message" htmlFor="msg-body">
        <Textarea id="msg-body" name="body" required rows={6} maxLength={2000} defaultValue={state.values?.body} />
      </Field>
      <SubmitButton pendingText="Sending…">Send message</SubmitButton>
    </form>
  );
}
