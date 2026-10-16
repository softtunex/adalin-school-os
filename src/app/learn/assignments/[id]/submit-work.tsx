"use client";

import { useActionState, useState } from "react";
import { FileUploader, type ExistingFile } from "@/components/file-uploader";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { initialFormState } from "@/lib/form-state";
import { studentUploadAction, submitWorkAction } from "../../actions";

export function SubmitWork({ assignmentId, text, files, resubmit }: { assignmentId: string; text: string; files: ExistingFile[]; resubmit: boolean }) {
  const [state, action, pending] = useActionState(submitWorkAction.bind(null, assignmentId), initialFormState);
  const [uploading, setUploading] = useState(false);
  return (
    <Card className="p-5">
      <form action={action} className="flex flex-col gap-4">
        <h2 className="fs-17 font-bold">{resubmit ? "Update your work" : "Your work"}</h2>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <Field label="Answer" htmlFor="work-text" hint="Type your answer, or attach a photo or document of your work.">
          <Textarea id="work-text" name="text" rows={6} defaultValue={state.values?.text ?? text} />
        </Field>
        <FileUploader request={studentUploadAction} existing={files} onBusyChange={setUploading} label="Attach your work" />
        <Button type="submit" size="lg" disabled={pending || uploading}>
          <Icon name="send" size={18} /> {pending ? "Handing in…" : uploading ? "Uploading…" : resubmit ? "Hand in again" : "Hand in"}
        </Button>
      </form>
    </Card>
  );
}
