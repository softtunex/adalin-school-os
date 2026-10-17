import { and, isNotNull, lt, ne, or } from "drizzle-orm";
import type { DB } from "../db/client";
import { loginAttempts, notifications, outboundMessages, passwordResets, paymentIntents, sessions, webhookDeliveries } from "../db/schema";

/*
 * Deletes what we no longer need, every day (NDPA data minimisation). The periods are the ones
 * the privacy notice promises (src/lib/legal-content.ts); change both together.
 */

export const REMOVED_BODY = "[Message text removed after 180 days]";

export async function purgeExpiredData(db: DB, now = new Date()) {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const n = (rows: unknown[]) => rows.length;
  return {
    sessions: n(await db.delete(sessions).where(lt(sessions.expiresAt, ago(30))).returning({ id: sessions.tokenHash })),
    loginAttempts: n(await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, ago(30))).returning({ id: loginAttempts.id })),
    passwordResets: n(
      await db
        .delete(passwordResets)
        .where(or(lt(passwordResets.expiresAt, ago(7)), and(isNotNull(passwordResets.usedAt), lt(passwordResets.usedAt, ago(7)))))
        .returning({ id: passwordResets.tokenHash }),
    ),
    // The record that a message went out stays (receipts, billing reminders); its text doesn't.
    messageText: n(
      await db
        .update(outboundMessages)
        .set({ body: REMOVED_BODY })
        .where(and(lt(outboundMessages.createdAt, ago(180)), ne(outboundMessages.body, REMOVED_BODY), ne(outboundMessages.status, "queued")))
        .returning({ id: outboundMessages.id }),
    ),
    notifications: n(await db.delete(notifications).where(lt(notifications.createdAt, ago(365))).returning({ id: notifications.id })),
    webhookDeliveries: n(await db.delete(webhookDeliveries).where(lt(webhookDeliveries.createdAt, ago(90))).returning({ id: webhookDeliveries.id })),
    unfinishedPayments: n(await db.delete(paymentIntents).where(and(ne(paymentIntents.status, "succeeded"), lt(paymentIntents.createdAt, ago(90)))).returning({ id: paymentIntents.id })),
  };
}
