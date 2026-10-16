import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your school" };

export default function SignupPage() {
  return (
    <>
      <h1 className="font-display fs-32 font-black leading-tight tracking-[-0.02em]">Set up your school</h1>
      <p className="mt-1 fs-15.5 text-muted">Free for up to 50 students. No card needed.</p>
      <SignupForm />
      <p className="mt-8 text-center fs-15 text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-blue hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
