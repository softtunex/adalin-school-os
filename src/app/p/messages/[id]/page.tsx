import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageThread } from "@/components/message-thread";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { parentThread } from "@/lib/services/messaging";
import { replyAction } from "../../actions";

export const metadata: Metadata = { title: "Conversation" };

export default async function ParentConversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  let t: Awaited<ReturnType<typeof parentThread>>;
  try {
    t = await parentThread(getDb(), user.id, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const staff = t.people.filter((p) => p.role === "staff").map((p) => p.name);
  const closed = t.school.comms.parentMessaging === false ? `${t.school.name} isn't taking messages through the app at the moment.` : !t.open && t.hours ? `${t.school.name} takes messages between ${t.hours.start} and ${t.hours.end}.` : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/p/messages" className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-muted hover:text-ink">
        <Icon name="chevronLeft" size={16} /> Messages
      </Link>
      <div>
        <h1 className="fs-20 font-bold">{t.conversation.subject}</h1>
        <p className="fs-14 text-muted">
          With {staff.join(", ")} · {t.school.name}
        </p>
      </div>
      <MessageThread
        me={user.id}
        messages={t.messages.map((m) => ({ id: m.id, senderId: m.senderId, senderName: m.senderName, body: m.body, createdAt: m.createdAt.toISOString() }))}
        reply={replyAction.bind(null, id)}
        closedReason={closed}
      />
    </div>
  );
}
