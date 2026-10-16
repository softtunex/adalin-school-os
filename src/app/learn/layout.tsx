import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/display";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { myStudentRecord } from "@/lib/services/student-portal";
import { SetPasswordForm } from "./set-password-form";
import { StudentShell } from "./student-shell";

export default async function LearnLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/student");
  const me = await myStudentRecord(getDb(), user.id);
  if (!me) redirect("/schools");
  const shell = { name: `${me.firstName} ${me.lastName}`, contact: `${me.admissionNo}${me.className ? ` · ${me.className}` : ""}` };
  return (
    <StudentShell user={shell} show={{ timetable: me.school.features.includes("timetable"), results: me.school.studentResults }}>
      {user.mustChangePassword ? (
        <Card className="mx-auto mt-6 max-w-[440px] p-6">
          <h1 className="fs-22 font-bold">Welcome, {me.firstName}</h1>
          <p className="mt-1 fs-15 text-muted">Choose your own password. You&apos;ll use it with your admission number from now on.</p>
          <SetPasswordForm />
        </Card>
      ) : (
        children
      )}
    </StudentShell>
  );
}
