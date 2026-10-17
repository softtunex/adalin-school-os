import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "./guard";
import { AdminNav } from "./nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · School OS admin" }, robots: { index: false, follow: false } };

/** Adalin's console: its own shell, outside any school. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-4 sm:px-8">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-chunk bg-ink fs-14 font-bold text-canvas">OS</span>
            <span className="fs-16 font-bold text-ink">
              School OS <span className="font-medium text-muted">admin</span>
            </span>
          </Link>
          <span className="ml-auto fs-13.5 text-muted">
            {admin.name} ·{" "}
            <Link href="/schools" className="font-semibold text-ink hover:underline">
              Back to my schools
            </Link>
          </span>
          <div className="w-full">
            <AdminNav />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
