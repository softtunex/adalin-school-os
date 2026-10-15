import { eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Chip } from "@/components/ui/display";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { roles, schools, users } from "@/lib/db/schema";
import { findUserByEmail } from "@/lib/services/accounts";
import { findInvitation } from "@/lib/services/staff";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = { title: "Join your school" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const invitation = await findInvitation(db, token);

  if (!invitation) {
    return (
      <>
        <h1 className="text-[32px] font-black tracking-[-0.03em]">This invitation has expired</h1>
        <p className="mt-2 text-[15.5px] text-muted">It may have been cancelled or already used. Ask your school admin to send a new one.</p>
        <ButtonLink href="/login" variant="secondary" className="mt-8">
          Go to log in
        </ButtonLink>
      </>
    );
  }

  const [[school], roleRows, [inviter], current, existing] = await Promise.all([
    db.select({ name: schools.name }).from(schools).where(eq(schools.id, invitation.schoolId)),
    db.select({ name: roles.name }).from(roles).where(inArray(roles.id, invitation.roleIds)),
    invitation.invitedBy ? db.select({ name: users.name }).from(users).where(eq(users.id, invitation.invitedBy)) : Promise.resolve([]),
    getCurrentUser(),
    findUserByEmail(db, invitation.email),
  ]);

  const signedInAsInvitee = current?.email?.toLowerCase() === invitation.email;

  return (
    <>
      <p className="label-caps text-brand-ink">You&apos;re invited</p>
      <h1 className="mt-1 text-[32px] font-black leading-tight tracking-[-0.03em]">Join {school?.name}</h1>
      <p className="mt-2 text-[15.5px] text-muted">
        {inviter ? `${inviter.name} invited you` : "You've been invited"} as
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {roleRows.map((r) => (
          <Chip key={r.name} tone="brand">
            {r.name}
          </Chip>
        ))}
      </div>

      {current && !signedInAsInvitee ? (
        <Alert tone="warning" className="mt-8" title={`This invitation is for ${invitation.email}`}>
          You&apos;re logged in as {current.email}. Log out and log in with the invited email to accept.
        </Alert>
      ) : signedInAsInvitee ? (
        <AcceptInviteForm token={token} mode="existing" />
      ) : existing ? (
        <Alert tone="blue" className="mt-8" title="You already have an account">
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="font-bold text-blue underline">
            Log in as {invitation.email}
          </Link>{" "}
          to accept.
        </Alert>
      ) : (
        <AcceptInviteForm token={token} mode="new" email={invitation.email} name={invitation.name} />
      )}
    </>
  );
}
