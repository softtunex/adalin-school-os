import { appUrl } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { can, type Access } from "@/lib/services/access";
import { getApplyPage, listApplicants } from "@/lib/services/admissions";
import { paystackMode } from "@/lib/services/paystack";
import { AdmissionSettingsForm } from "./settings-form";

/** Admission form settings, shown on the Admissions page and under Settings. */
export async function AdmissionSettings({ slug, access }: { slug: string; access: Access }) {
  const db = getDb();
  const [form, list] = await Promise.all([getApplyPage(db, slug), listApplicants(db, access, { limit: 1 })]);
  const s = access.school.admissionSettings;
  const mode = paystackMode();
  const payNote =
    mode === "off" || (!access.school.paystackSubaccount && mode !== "test")
      ? "Parents will pay at the school. To take the fee online, add your bank account in Settings → Payments."
      : `Paid online by card, transfer or USSD, straight into your school account${s.feeKobo ? ` (currently ${formatNaira(s.feeKobo)})` : ""}.`;
  return (
    <AdmissionSettingsForm
      slug={slug}
      link={`${await appUrl()}/apply/${slug}`}
      levels={list.levels}
      settings={{ open: !!form?.open, levelIds: s.levelIds ?? [], fee: s.feeKobo ? String(s.feeKobo / 100) : "", intro: s.intro ?? "", examInfo: s.examInfo ?? "", assessment: s.assessment ?? "both" }}
      editable={can(access, "admissions:manage")}
      payNote={payNote}
    />
  );
}
