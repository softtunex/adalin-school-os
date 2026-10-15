import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { requireUser } from "@/lib/auth/session";
import { NewSchoolForm } from "./new-school-form";

export const metadata: Metadata = { title: "Add a school" };

export default async function NewSchoolPage() {
  await requireUser();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 py-8">
      <Logo href="/schools" />
      <h1 className="mt-12 text-[30px] font-black tracking-[-0.03em]">Add a school</h1>
      <p className="mt-1 text-[15.5px] text-muted">For proprietors running more than one school. Each school starts on the Free plan and is billed separately.</p>
      <NewSchoolForm />
      <Link href="/schools" className="mt-6 text-center text-[15px] font-bold text-blue hover:underline">
        Cancel
      </Link>
    </div>
  );
}
