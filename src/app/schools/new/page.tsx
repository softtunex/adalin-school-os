import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Alert } from "@/components/ui/display";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { TRIAL_DAYS } from "@/lib/services/billing";
import { limitMessage, newSchoolTerms } from "@/lib/services/school-limits";
import { NewSchoolForm } from "./new-school-form";

export const metadata: Metadata = { title: "Add a school" };

export default async function NewSchoolPage() {
  const user = await requireUser();
  const terms = await newSchoolTerms(getDb(), user.id);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 py-8">
      <Logo href="/schools" />
      <h1 className="mt-12 fs-30 font-black tracking-[-0.03em]">Add a school</h1>
      {terms.atLimit ? (
        <Alert tone="blue" className="mt-6" title="Ready for Enterprise">
          {limitMessage()}
        </Alert>
      ) : terms.freeSchool ? (
        <>
          <p className="mt-1 fs-15.5 text-muted">
            Each school has its own records and its own plan. {terms.freeSchool} is your free school, so this one starts with a {TRIAL_DAYS}-day free trial. After the trial it moves to Basic, unless you choose another plan.
          </p>
          <NewSchoolForm chooseTrial />
        </>
      ) : (
        <>
          <p className="mt-1 fs-15.5 text-muted">For proprietors running more than one school. Each school has its own records and its own plan, and starts on the Free plan.</p>
          <NewSchoolForm />
        </>
      )}
      <Link href="/schools" className="mt-6 text-center fs-15 font-bold text-blue hover:underline">
        {terms.atLimit ? "Back to your schools" : "Cancel"}
      </Link>
    </div>
  );
}
