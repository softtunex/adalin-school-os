"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { SECTIONS } from "@/lib/academics/sections";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import {
  addClassArm,
  addLevel,
  assignSubjectTeacher,
  createSession,
  removeClass,
  removeSubject,
  saveSubject,
  setCurrentTerm,
  setupAcademics,
  updateClass,
  updateTermDates,
} from "@/lib/services/academics";
import { setClassElectives } from "@/lib/services/electives";
import { bandsSchema, componentsSchema, saveBands, saveComponents } from "@/lib/services/assessment";
import { fieldErrors } from "@/lib/validation";

async function run(slug: string, fn: (ctx: { access: Awaited<ReturnType<typeof requireAccess>>; ip: string | null }) => Promise<unknown>, success: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    const { ip } = await requestMeta();
    await fn({ access, ip });
    revalidatePath(`/s/${slug}`, "layout");
    return { success };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

const splitArms = (raw: FormDataEntryValue | null) =>
  String(raw ?? "")
    .split(/[,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);

const setupSchema = z.object({
  template: z.enum(["nigerian", "british"]),
  sections: z.array(z.enum(SECTIONS)).min(1, "Choose at least one section your school runs."),
  sessionName: z.string().trim().regex(/^\d{4}\/\d{4}$/, "Use the format 2026/2027."),
});

export async function setupAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["template", "sessionName", "arms"]);
  const parsed = setupSchema.safeParse({ ...values, sections: formData.getAll("sections") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const result = await run(slug, ({ access, ip }) => setupAcademics(getDb(), access, { ...parsed.data, arms: splitArms(formData.get("arms")) }, ip), "Your classes and subjects are ready.");
  return { ...result, values };
}

export async function addLevelAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ name: z.string().trim().min(2, "Name the class level, e.g. JSS 1.").max(40), section: z.enum(SECTIONS) })
    .safeParse({ name: formData.get("name"), section: formData.get("section") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  return run(slug, ({ access, ip }) => addLevel(getDb(), access, { ...parsed.data, arms: splitArms(formData.get("arms")) }, ip), `${parsed.data.name} added.`);
}

export async function addArmAction(slug: string, levelId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const arm = String(formData.get("arm") ?? "").trim();
  if (!arm || arm.length > 30) return { fieldErrors: { arm: "Name the arm, e.g. Gold or B." } };
  return run(slug, ({ access, ip }) => addClassArm(getDb(), access, levelId, arm, ip), "Class added.");
}

export async function updateClassAction(slug: string, classId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = String(formData.get("classTeacherId") ?? "");
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? Number(capacityRaw) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)) return { fieldErrors: { capacity: "Enter a whole number between 1 and 500." } };
  return run(slug, ({ access, ip }) => updateClass(getDb(), access, classId, { classTeacherId: teacher || null, capacity }, ip), "Class updated.");
}

export async function removeClassAction(slug: string, classId: string): Promise<FormState> {
  return run(slug, ({ access, ip }) => removeClass(getDb(), access, classId, ip), "Class removed.");
}

export async function saveSubjectAction(slug: string, subjectId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ name: z.string().trim().min(2, "Name the subject.").max(80), code: z.string().trim().max(12).optional() })
    .safeParse({ name: formData.get("name"), code: formData.get("code") ?? undefined });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: formValues(formData, ["name", "code"]) };
  const levelIds = formData.getAll("levelIds").map(String);
  const electiveLevelIds = formData.getAll("electiveLevelIds").map(String);
  return run(
    slug,
    ({ access, ip }) =>
      saveSubject(getDb(), access, { id: subjectId ?? undefined, name: parsed.data.name, code: parsed.data.code || null, levelIds, electiveLevelIds }, ip),
    subjectId ? "Subject updated." : "Subject added.",
  );
}

export async function removeSubjectAction(slug: string, subjectId: string): Promise<FormState> {
  return run(slug, ({ access, ip }) => removeSubject(getDb(), access, subjectId, ip), "Subject removed.");
}

export async function createSessionAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!/^\d{4}\/\d{4}$/.test(name)) return { fieldErrors: { name: "Use the format 2027/2028." } };
  const [a, b] = name.split("/").map(Number);
  if (b !== a + 1) return { fieldErrors: { name: "The second year should follow the first, e.g. 2027/2028." } };
  return run(slug, ({ access, ip }) => createSession(getDb(), access, { name }, ip), `${name} session created.`);
}

export async function setCurrentTermAction(slug: string, termId: string): Promise<FormState> {
  return run(slug, ({ access, ip }) => setCurrentTerm(getDb(), access, termId, ip), "Current term updated.");
}

export async function updateTermDatesAction(slug: string, termId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const startsOn = String(formData.get("startsOn") ?? "") || null;
  const endsOn = String(formData.get("endsOn") ?? "") || null;
  const dateOk = (v: string | null) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!dateOk(startsOn) || !dateOk(endsOn)) return { error: "Enter valid dates." };
  return run(slug, ({ access, ip }) => updateTermDates(getDb(), access, termId, { startsOn, endsOn }, ip), "Term dates saved.");
}

export async function assignTeacherAction(slug: string, classId: string, subjectId: string, membershipId: string): Promise<FormState> {
  return run(slug, ({ access, ip }) => assignSubjectTeacher(getDb(), access, { classId, subjectId, membershipId: membershipId || null }, ip), "Teacher assigned.");
}

const picksSchema = z.array(z.object({ studentId: z.string().uuid(), subjectId: z.string().uuid() })).max(20000);

export async function saveElectivesAction(slug: string, classId: string, picks: unknown): Promise<FormState> {
  const parsed = picksSchema.safeParse(picks);
  if (!parsed.success || !z.string().uuid().safeParse(classId).success) return { error: "The choices couldn't be read. Reload and try again." };
  return run(slug, ({ access, ip }) => setClassElectives(getDb(), access, classId, parsed.data, ip), "Elective subjects saved.");
}

export async function saveComponentsAction(slug: string, components: unknown): Promise<FormState> {
  const parsed = componentsSchema.safeParse(components);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the components." };
  return run(slug, ({ access, ip }) => saveComponents(getDb(), access, parsed.data, ip), "Assessment saved.");
}

export async function saveBandsAction(slug: string, bands: unknown): Promise<FormState> {
  const parsed = bandsSchema.safeParse(bands);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the grading scale." };
  return run(slug, ({ access, ip }) => saveBands(getDb(), access, parsed.data, ip), "Grading scale saved.");
}
