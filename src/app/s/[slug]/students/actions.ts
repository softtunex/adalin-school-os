"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { STUDENT_STATUSES } from "@/lib/db/schema";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import {
  addGuardian,
  createStudent,
  guardianInputSchema,
  setPrimaryGuardian,
  setStudentStatus,
  studentInputSchema,
  unlinkGuardian,
  updateStudent,
  type GuardianInput,
} from "@/lib/services/students";
import { fieldErrors } from "@/lib/validation";

const STUDENT_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "gender",
  "dateOfBirth",
  "admittedOn",
  "admissionNo",
  "classId",
  "stateOfOrigin",
  "lga",
  "religion",
  "bloodGroup",
  "genotype",
  "address",
  "medicalNotes",
] as const;
const GUARDIAN_FIELDS = ["name", "relationship", "phone", "email", "occupation", "address"] as const;

function readValues(formData: FormData) {
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") values[k] = v;
  return values;
}

/** Parses guardians g1_*, g2_*. A guardian block counts only if a name or phone was entered. */
function parseGuardians(values: Record<string, string>, required: boolean) {
  const guardians: GuardianInput[] = [];
  const errors: Record<string, string> = {};
  for (const prefix of ["g1", "g2"]) {
    const raw = Object.fromEntries(GUARDIAN_FIELDS.map((f) => [f, values[`${prefix}_${f}`] ?? ""]));
    const filled = raw.name.trim() || raw.phone.trim();
    if (!filled) {
      if (prefix === "g1" && required) errors["g1_name"] = "Add at least one parent or guardian.";
      continue;
    }
    const parsed = guardianInputSchema.safeParse({ ...raw, relationship: raw.relationship || "Parent" });
    if (!parsed.success) {
      for (const [k, msg] of Object.entries(fieldErrors(parsed.error))) errors[`${prefix}_${k}`] = msg;
    } else guardians.push(parsed.data);
  }
  return { guardians, errors };
}

export async function createStudentAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = readValues(formData);
  const parsed = studentInputSchema.safeParse(Object.fromEntries(STUDENT_FIELDS.map((f) => [f, values[f] ?? ""])));
  const { guardians, errors } = parseGuardians(values, true);
  const allErrors = { ...(parsed.success ? {} : fieldErrors(parsed.error)), ...errors };
  if (!parsed.success || Object.keys(errors).length) return { fieldErrors: allErrors, values, error: "Check the highlighted fields." };

  let id: string;
  try {
    const access = await requireAccess(slug);
    const student = await createStudent(getDb(), access, parsed.data, guardians, (await requestMeta()).ip);
    id = student.id;
  } catch (error) {
    return { error: userMessage(error), values };
  }
  revalidatePath(`/s/${slug}/students`);
  redirect(formData.get("intent") === "another" ? `/s/${slug}/students/new?added=${Date.now()}` : `/s/${slug}/students/${id}?created=1`);
}

export async function updateStudentAction(slug: string, studentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = readValues(formData);
  const parsed = studentInputSchema.safeParse(Object.fromEntries(STUDENT_FIELDS.map((f) => [f, values[f] ?? ""])));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values, error: "Check the highlighted fields." };
  try {
    const access = await requireAccess(slug);
    await updateStudent(getDb(), access, studentId, parsed.data, (await requestMeta()).ip);
  } catch (error) {
    return { error: userMessage(error), values };
  }
  revalidatePath(`/s/${slug}/students`, "layout");
  redirect(`/s/${slug}/students/${studentId}?saved=1`);
}

export async function setStudentStatusAction(slug: string, studentId: string, status: string): Promise<FormState> {
  if (!(STUDENT_STATUSES as readonly string[]).includes(status)) return { error: "Choose a valid status." };
  try {
    const access = await requireAccess(slug);
    await setStudentStatus(getDb(), access, studentId, status as (typeof STUDENT_STATUSES)[number], (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/students`, "layout");
    return { success: "Status updated." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function addGuardianAction(slug: string, studentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = readValues(formData);
  const parsed = guardianInputSchema.safeParse({ ...values, relationship: values.relationship || "Parent" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    const access = await requireAccess(slug);
    await addGuardian(getDb(), access, studentId, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/students/${studentId}`);
    return { success: `${parsed.data.name} linked.` };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function unlinkGuardianAction(slug: string, studentId: string, guardianId: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await unlinkGuardian(getDb(), access, studentId, guardianId, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/students/${studentId}`);
    return { success: "Removed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function setPrimaryGuardianAction(slug: string, studentId: string, guardianId: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await setPrimaryGuardian(getDb(), access, studentId, guardianId);
    revalidatePath(`/s/${slug}/students/${studentId}`);
    return { success: "Primary contact updated." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
