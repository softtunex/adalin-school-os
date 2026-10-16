"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { staffStartAction } from "../actions";

export function StaffNewMessage({ slug, kids, defaultStudent, offApp }: { slug: string; kids: { id: string; label: string; group: string }[]; defaultStudent: string; offApp: number }) {
  const router = useRouter();
  const [state, action] = useActionState(staffStartAction.bind(null, slug), initialFormState);
  useEffect(() => {
    if (state.data?.conversationId) router.replace(`/s/${slug}/messages/${state.data.conversationId}`);
  }, [state.data?.conversationId, router, slug]);
  const groups = [...new Set(kids.map((k) => k.group))];
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Whose parents" htmlFor="sm-student" hint={offApp ? `${offApp} other ${offApp === 1 ? "child's parents aren't" : "children's parents aren't"} on the app yet.` : undefined}>
        <Select id="sm-student" name="studentId" required defaultValue={state.values?.studentId ?? defaultStudent}>
          <option value="" disabled>
            Choose a child…
          </option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {kids
                .filter((k) => k.group === g)
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <Field label="Subject" htmlFor="sm-subject">
        <Input id="sm-subject" name="subject" required maxLength={120} defaultValue={state.values?.subject} placeholder="e.g. Homework this week" />
      </Field>
      <Field label="Message" htmlFor="sm-body">
        <Textarea id="sm-body" name="body" required rows={6} maxLength={2000} defaultValue={state.values?.body} />
      </Field>
      <SubmitButton pendingText="Sending…">Send</SubmitButton>
    </form>
  );
}
