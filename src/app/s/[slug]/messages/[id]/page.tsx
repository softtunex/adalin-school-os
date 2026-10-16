import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageThread } from "@/components/message-thread";
import { PageBody, Topbar } from "@/components/topbar";
import { Alert } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { staffThread } from "@/lib/services/messaging";
import { staffReplyAction } from "../actions";

export const metadata: Metadata = { title: "Conversation" };

export default async function StaffConversation({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await requirePageAccess(slug, ["comms:message"]);
  let t: Awaited<ReturnType<typeof staffThread>>;
  try {
    t = await staffThread(getDb(), access, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const parents = t.people.filter((p) => p.role === "parent").map((p) => p.name);
  const staff = t.people.filter((p) => p.role === "staff").map((p) => p.name);

  return (
    <>
      <Topbar title={t.conversation.subject} context={parents.join(", ")} />
      <PageBody>
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
          <Link href={`/s/${slug}/messages`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
            <Icon name="chevronLeft" size={16} /> Messages
          </Link>
          <p className="fs-14 text-muted">
            {t.student ? (
              <>
                About{" "}
                <Link href={`/s/${slug}/students/${t.student.id}`} className="font-medium text-blue">
                  {t.student.firstName} {t.student.lastName}
                </Link>
                {" · "}
              </>
            ) : null}
            Staff: {staff.join(", ")}
          </p>
          {!t.participant ? <Alert tone="blue">You&apos;re reading this as school leadership. If you reply, you join the conversation and everyone in it will see your message.</Alert> : null}
          <MessageThread
            me={access.user.id}
            messages={t.messages.map((m) => ({ id: m.id, senderId: m.senderId, senderName: m.senderName, body: m.body, createdAt: m.createdAt.toISOString() }))}
            reply={staffReplyAction.bind(null, slug, id)}
          />
        </div>
      </PageBody>
    </>
  );
}
