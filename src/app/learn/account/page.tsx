import type { Metadata } from "next";
import { Card } from "@/components/ui/display";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { requireStudent } from "@/lib/services/student-portal";
import { studentLogoutAction } from "../actions";
import { SetPasswordForm } from "../set-password-form";

export const metadata: Metadata = { title: "Account" };

export default async function StudentAccount() {
  const user = await requireUser();
  const me = await requireStudent(getDb(), user.id);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="fs-26 font-bold tracking-[-0.02em]">Account</h1>
      <Card className="p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          {[
            ["Name", `${me.firstName} ${me.lastName}`],
            ["Admission number", me.admissionNo],
            ["School code", me.school.slug],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="fs-13 text-muted">{k}</dt>
              <dd className="mt-0.5 fs-15 font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="p-5">
        <h2 className="fs-16 font-semibold">Change your password</h2>
        <SetPasswordForm />
      </Card>
      <form action={studentLogoutAction}>
        <button className="fs-15 font-bold text-danger">Sign out</button>
      </form>
    </div>
  );
}
