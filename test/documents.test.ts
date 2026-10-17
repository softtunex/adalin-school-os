import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { roles, schools, students } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import {
  documentSettings,
  documentSettingsSchema,
  fillTemplate,
  fromTemplateSchema,
  idCardSchema,
  issueFromTemplate,
  issueIdCards,
  issueTestimonial,
  issueTranscript,
  listIssued,
  listTemplates,
  revokeDocument,
  saveTemplate,
  schoolCode,
  templateSchema,
  testimonialSchema,
  verifyDocument,
} from "@/lib/services/documents";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, guardianInputSchema, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let admin: Access;
let teacher: Access;
let gold: string;
const kids: Record<string, string> = {};

async function staff(key: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Paper", email: "paper@docs.test", password: "Papers123", schoolName: "Adalin College" });
  await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  gold = (await getAcademicOverview(database.db, owner)).levels[0].classes[0].id;
  admin = await staff("admin", "admin@docs.test");
  teacher = await staff("subject_teacher", "teach@docs.test");
  for (const name of ["Ada", "Bayo"])
    kids[name] = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Okafor", gender: name === "Ada" ? "female" : "male", classId: gold }), [guardianInputSchema.parse({ name: `Mrs ${name} Okafor`, relationship: "Mother", phone: name === "Ada" ? "08031110001" : "08031110002" })])).id;
});

afterAll(async () => {
  await database.close();
});

describe("documents", () => {
  it("keeps up to three signatories, and reads the older single signatory", () => {
    expect(documentSettings({ signatoryName: "Dr Ade", signatoryTitle: "Principal" }).signatories).toEqual([{ name: "Dr Ade", title: "Principal", signatureUrl: null }]);
    const four = Array.from({ length: 4 }, () => ({ name: "A", title: "Principal" }));
    expect(documentSettingsSchema.safeParse({ signatories: four, cardNote: "" }).success).toBe(false);
    expect(documentSettingsSchema.safeParse({ signatories: [{ name: "A", title: "Principal", signatureUrl: "https://evil.example/x.png" }], cardNote: "" }).success).toBe(false);
    expect(documentSettingsSchema.safeParse({ signatories: [{ name: "A", title: "Principal", signatureUrl: "/uploads/signatures/x.png" }, { name: "B", title: "Proprietor" }], cardNote: "" }).success).toBe(true);
  });

  it("fills templates and rejects unknown fields", () => {
    expect(schoolCode("Adalin College")).toBe("AC");
    expect(fillTemplate("Dear {{parent}}, {{first_name}} is in {{ class }}.", { parent: "Mrs Okafor", first_name: "Ada", class: "JSS 1 Gold" })).toBe("Dear Mrs Okafor, Ada is in JSS 1 Gold.");
    expect(templateSchema.safeParse({ kind: "letter", name: "Bad", title: "Hi", body: "Dear {{guardian}}, welcome." }).success).toBe(false);
  });

  it("prints ID cards for a class with a stable code per student", async () => {
    await expect(issueIdCards(database.db, teacher, idCardSchema.parse({ classId: gold }))).rejects.toThrow(/permission/);
    const first = await issueIdCards(database.db, admin, idCardSchema.parse({ classId: gold }));
    expect(first.cards.map((c) => c.holderName).sort()).toEqual(["Ada Okafor", "Bayo Okafor"]);
    expect(first.cards[0].serial).toMatch(/^AC-ID-\d{4}-0000[12]$/);
    const again = await issueIdCards(database.db, admin, idCardSchema.parse({ studentIds: [kids.Ada] }));
    const ada = first.cards.find((c) => c.holderName === "Ada Okafor")!;
    expect(again.cards[0].token).toBe(ada.token);
    expect((await listIssued(database.db, admin, { kind: "id_card" })).total).toBe(2);
    const third = await issueIdCards(database.db, admin, idCardSchema.parse({ staff: true, membershipIds: [teacher.membershipId] }));
    expect(third.cards[0].serial).toMatch(/-00003$/);
  });

  it("checks a document publicly, and a revoked or departed holder shows as such", async () => {
    const { rows } = await listIssued(database.db, admin, { kind: "id_card", q: "Bayo" });
    const card = rows[0].d;
    expect((await verifyDocument(database.db, owner.school.slug, card.token))?.holderActive).toBe(true);
    expect((await verifyDocument(database.db, owner.school.slug, "not-a-real-code-at-all"))?.doc).toBeNull();
    expect(await verifyDocument(database.db, "no-such-school", card.token)).toBeNull();
    await withTenant(database.db, owner.school.id, (tx) => tx.update(students).set({ status: "withdrawn" }).where(eq(students.id, kids.Bayo)));
    expect((await verifyDocument(database.db, owner.school.slug, card.token))?.holderActive).toBe(false);
    await revokeDocument(database.db, admin, { id: card.id, reason: "Card lost" });
    expect((await verifyDocument(database.db, owner.school.slug, card.token))?.doc?.revokeReason).toBe("Card lost");
    await expect(revokeDocument(database.db, admin, { id: card.id, reason: "Again" })).rejects.toThrow(/already revoked/);
  });

  it("issues testimonials and letters from templates", async () => {
    const t = await issueTestimonial(database.db, admin, testimonialSchema.parse({ studentId: kids.Ada, conduct: "Excellent", yearsFrom: "2020", yearsTo: "2026", lastClass: "JSS 1 Gold", remark: "A kind and hard-working student." }));
    expect(t.serial).toMatch(/^AC-TES-/);
    const templates = await listTemplates(database.db, admin);
    const letter = templates.find((x) => x.kind === "letter")!;
    const r = await issueFromTemplate(database.db, admin, fromTemplateSchema.parse({ templateId: letter.id, studentIds: [kids.Ada] }));
    expect(r.docs[0].data).toMatchObject({ parent: "Mrs Ada Okafor" });
    expect(String(r.docs[0].data.body)).toContain("Ada (JSS 1 Gold)");
    await expect(saveTemplate(database.db, teacher, templateSchema.parse({ kind: "letter", name: "Teacher letter", title: "Hello", body: "Dear {{parent}}, hello there." }))).rejects.toThrow(/permission|Premium/);
  });

  it("refuses a transcript with no published results", async () => {
    await expect(issueTranscript(database.db, admin, { studentId: kids.Ada })).rejects.toThrow(/no published results/);
  });
});
