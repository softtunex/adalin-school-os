import type { Tx } from "../db/client";
import { auditLogs } from "../db/schema";

export type AuditActor = { userId: string; name: string; ip?: string | null };

export async function recordAudit(
  tx: Tx,
  schoolId: string,
  actor: AuditActor | null,
  entry: { action: string; summary: string; entityType?: string; entityId?: string; meta?: Record<string, unknown> },
) {
  await tx.insert(auditLogs).values({
    schoolId,
    actorUserId: actor?.userId ?? null,
    actorName: actor?.name ?? "System",
    ip: actor?.ip ?? null,
    ...entry,
  });
}
