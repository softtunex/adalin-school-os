import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));
  return (
    <>
      <h1 className="font-display fs-32 font-black leading-tight tracking-[-0.02em]">Welcome back</h1>
      <p className="mt-1 fs-15.5 text-muted">Log in to your school.</p>
      <LoginForm next={safeNext(next)} />
      <p className="mt-8 text-center fs-15 text-muted">
        New school?{" "}
        <Link href="/signup" className="font-semibold text-blue hover:underline">
          Create a free account
        </Link>
      </p>
      <Link href="/parent" className="mt-4 flex items-center justify-center gap-2 rounded-chunk border border-line bg-paper px-4 py-3 fs-14.5 font-semibold text-ink hover:border-brand">
        Parent? Sign in with your phone number
      </Link>
    </>
  );
}
