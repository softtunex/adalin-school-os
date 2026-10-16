import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listUserSchools } from "@/lib/services/access";
import { myChildren } from "@/lib/services/parent-portal";
import { parentLogoutAction } from "../actions";
import { AccountForm } from "./account-form";

export const metadata: Metadata = { title: "Account" };

function phone(p: string | null) {
  return p?.startsWith("+234") && p.length === 14 ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p;
}

export default async function ParentAccount() {
  const user = await requireUser();
  const db = getDb();
  const [children, staffSchools] = await Promise.all([myChildren(db, user.id), listUserSchools(db, user.id)]);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="fs-26 font-bold tracking-[-0.02em]">Account</h1>
      <Card className="p-5">
        <AccountForm name={user.name} contact={phone(user.phone) ?? user.email ?? ""} prefs={user.notifyPrefs ?? {}} />
      </Card>
      <Card className="p-5">
        <h2 className="fs-16 font-semibold">Your children</h2>
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {children.map((c) => (
            <li key={c.studentId} className="flex items-center justify-between gap-3 py-2.5 fs-14.5">
              <span className="text-ink">
                {c.firstName} {c.lastName}
              </span>
              <span className="text-muted">
                {c.relationship} · {c.school.name}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 fs-13.5 text-muted">Missing a child? Ask their school to add this phone number or email to the child&apos;s record.</p>
      </Card>
      {staffSchools.length ? (
        <Link href="/schools?pick=1" className="flex items-center gap-3 rounded-card border border-line bg-canvas p-4 font-semibold text-ink hover:border-brand">
          <Icon name="school" className="text-brand" /> Switch to your staff account
          <Icon name="arrowRight" size={18} className="ml-auto text-muted" />
        </Link>
      ) : null}
      <form action={parentLogoutAction}>
        <button className="fs-15 font-bold text-danger">Sign out</button>
      </form>
    </div>
  );
}
