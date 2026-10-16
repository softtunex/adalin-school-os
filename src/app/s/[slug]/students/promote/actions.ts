"use server";

import { z } from "zod";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { applyPromotion } from "@/lib/services/promotion";

const decisionsSchema = z
  .array(
    z.object({
      studentId: z.string().uuid(),
      action: z.enum(["promote", "repeat", "graduate", "withdraw"]),
      targetClassId: z.string().uuid().nullable(),
    }),
  )
  .min(1)
  .max(5000);

export async function applyPromotionAction(
  slug: string,
  toSessionId: string,
  decisions: unknown,
  makeCurrent: boolean,
): Promise<{ error?: string; counts?: Record<string, number> }> {
  const parsed = decisionsSchema.safeParse(decisions);
  if (!parsed.success || !z.string().uuid().safeParse(toSessionId).success) return { error: "Something in the list isn't valid. Reload the page and try again." };
  try {
    const access = await requireAccess(slug);
    const counts = await applyPromotion(getDb(), access, { toSessionId, decisions: parsed.data, makeCurrent: Boolean(makeCurrent) }, (await requestMeta()).ip);
    // No revalidation here: the board stays on its success screen; other pages load fresh on navigation.
    return { counts };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
