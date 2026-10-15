import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your school" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-[32px] font-black tracking-[-0.03em]">Set up your school</h1>
      <p className="mt-1 text-[15.5px] text-muted">Free for up to 50 students. No card needed.</p>
      <SignupForm />
      <p className="mt-8 text-center text-[15px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-blue hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
