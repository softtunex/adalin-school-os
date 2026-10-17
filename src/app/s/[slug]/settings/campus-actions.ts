"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { addNewCampus, createGroup, linkCampus, removeCampus } from "@/lib/services/groups";

async function run(slug: string, fn: (access: Awaited<ReturnType<typeof requireAccess>>) => Promise<string>): Promise<FormState> {
  try {
    const success = await fn(await requireAccess(slug));
    revalidatePath(`/s/${slug}`, "layout");
    revalidatePath("/schools");
    return { success };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function createGroupAction(slug: string, name: string) {
  return run(slug, async (access) => {
    const g = await createGroup(getDb(), access, name, (await requestMeta()).ip);
    return `${g.name} is set up, with ${access.school.name} as its first campus.`;
  });
}

export async function addCampusAction(slug: string, name: string) {
  return run(slug, async (access) => {
    const s = await addNewCampus(getDb(), access, name);
    return `${s.name} is ready. Open it from the school switcher to set it up.`;
  });
}

export async function linkCampusAction(slug: string, schoolId: string) {
  return run(slug, async (access) => {
    await linkCampus(getDb(), access, schoolId);
    return "Added to the group.";
  });
}

export async function removeCampusAction(slug: string, schoolId: string) {
  return run(slug, async (access) => {
    await removeCampus(getDb(), access, schoolId);
    return "Taken out of the group. It carries on as a school on its own.";
  });
}
