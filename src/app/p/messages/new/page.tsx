import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { myChildren } from "@/lib/services/parent-portal";
import { NewMessageForm } from "./new-message-form";

export const metadata: Metadata = { title: "New message" };

export default async function NewParentMessage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const user = await requireUser();
  const { student } = await searchParams;
  const children = (await myChildren(getDb(), user.id)).filter((c) => c.school.features.includes("messaging"));
  return (
    <div className="flex flex-col gap-4">
      <Link href="/p/messages" className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-muted hover:text-ink">
        <Icon name="chevronLeft" size={16} /> Messages
      </Link>
      <h1 className="fs-24 font-bold tracking-[-0.02em]">New message</h1>
      <Card className="p-5">
        {children.length === 0 ? (
          <p className="fs-14.5 text-muted">Your child&apos;s school hasn&apos;t switched on messaging yet.</p>
        ) : (
          <NewMessageForm
            defaultStudent={children.some((c) => c.studentId === student) ? student! : children[0].studentId}
            kids={children.map((c) => ({ id: c.studentId, label: `${c.firstName} ${c.lastName}${children.some((o) => o.schoolId !== c.schoolId) ? ` (${c.school.name})` : ""}` }))}
          />
        )}
      </Card>
    </div>
  );
}
