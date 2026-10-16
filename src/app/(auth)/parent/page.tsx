import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ParentLogin } from "./parent-login";

export const metadata: Metadata = { title: "Parent sign in" };

export default async function ParentLoginPage() {
  if (await getCurrentUser()) redirect("/p");
  return <ParentLogin />;
}
