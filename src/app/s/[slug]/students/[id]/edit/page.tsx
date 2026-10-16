import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/services/access";
import { listClassOptions } from "@/lib/services/academics";
import { fullName, getStudent } from "@/lib/services/students";
import { updateStudentAction } from "../../actions";
import { StudentForm } from "../../student-form";

export const metadata: Metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await requirePageAccess(slug, ["students:update"]);
  const db = getDb();
  const [profile, classes] = await Promise.all([getStudent(db, access, id), listClassOptions(db, access)]);
  if (!profile) notFound();
  const s = profile.student;
  const defaults = Object.fromEntries(
    Object.entries({
      firstName: s.firstName,
      middleName: s.middleName,
      lastName: s.lastName,
      gender: s.gender,
      dateOfBirth: s.dateOfBirth,
      admittedOn: s.admittedOn,
      admissionNo: s.admissionNo,
      classId: s.classId,
      stateOfOrigin: s.stateOfOrigin,
      lga: s.lga,
      religion: s.religion,
      bloodGroup: s.bloodGroup,
      genotype: s.genotype,
      address: s.address,
      medicalNotes: s.medicalNotes,
    }).map(([k, v]) => [k, v ?? ""]),
  );

  return (
    <>
      <Topbar title={`Edit ${fullName(s)}`} />
      <PageBody>
        <StudentForm
          action={updateStudentAction.bind(null, slug, id)}
          mode="edit"
          defaults={defaults}
          classes={classes}
          canMedical={can(access, "students:view_medical")}
          cancelHref={`/s/${slug}/students/${id}`}
        />
      </PageBody>
    </>
  );
}
