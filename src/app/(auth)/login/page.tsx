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
      <h1 className="text-[32px] font-black tracking-[-0.03em]">Welcome back</h1>
      <p className="mt-1 text-[15.5px] text-muted">Log in to your school.</p>
      <LoginForm next={safeNext(next)} />
      <p className="mt-8 text-center text-[15px] text-muted">
        New school?{" "}
        <Link href="/signup" className="font-bold text-blue hover:underline">
          Create a free account
        </Link>
      </p>
    </>
  );
}
