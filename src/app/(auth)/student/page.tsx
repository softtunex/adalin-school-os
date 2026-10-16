import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { StudentLoginForm } from "./student-login";

export const metadata: Metadata = { title: "Student sign in" };

export default async function StudentLoginPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const user = await getCurrentUser();
  if (user?.username) redirect("/learn");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="fs-28 font-black tracking-[-0.03em]">Student sign in</h1>
        <p className="mt-1 fs-15 text-muted">Use the school code and password on the slip your teacher gave you.</p>
      </div>
      <StudentLoginForm school={school?.replace(/[^a-z0-9-]/gi, "").toLowerCase() ?? ""} />
      <p className="fs-14 text-muted">
        Parent?{" "}
        <Link href="/parent" className="font-bold text-blue">
          Sign in here
        </Link>{" "}
        · Staff?{" "}
        <Link href="/login" className="font-bold text-blue">
          Log in here
        </Link>
      </p>
    </div>
  );
}
