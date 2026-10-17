import type { Metadata } from "next";
import { Clause, LegalPage } from "@/components/legal-page";
import { APP_NAME } from "@/lib/config";
import { COMPANY, PRIVACY_EMAIL } from "@/lib/legal";
import { PROCESSORS, RETENTION } from "@/lib/legal-content";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      current="/privacy"
      intro={
        <p>
          {APP_NAME} is school management software made by {COMPANY}. This notice explains what personal data is held in it, who is responsible for it, and the rights of the parents, students and staff it is about, under the
          Nigeria Data Protection Act 2023 (NDPA).
        </p>
      }
    >
      <Clause n={1} title="Who is responsible">
        <p>
          Each school decides what data it keeps about its students, parents and staff, and why. The school is the <strong>data controller</strong>. {COMPANY} stores and processes that data for the school, only on its
          instructions, as its <strong>data processor</strong>, under a data processing agreement every school accepts. For the accounts of school owners and for running our own business (billing schools, support), {COMPANY} is
          the controller.
        </p>
        <p>
          Questions about a school&apos;s records should go to the school first. You can also write to us at <strong className="select-all">{PRIVACY_EMAIL}</strong>.
        </p>
      </Clause>
      <Clause n={2} title="What is held">
        <ul className="list-disc pl-5">
          <li>Students: name, date of birth, gender, class, admission number, photo, attendance, scores and results, behaviour and health records the school chooses to keep, fees and payments.</li>
          <li>Parents and guardians: name, phone number, email, relationship to the child, and messages with the school.</li>
          <li>Staff: name, contact details, role, attendance, leave and, where the school uses payroll, pay and bank details.</li>
          <li>Everyone who signs in: sign-in details (passwords are stored only as a one-way hash), devices and times of sign-in, and a record of important actions for security.</li>
        </ul>
      </Clause>
      <Clause n={3} title="Children's data">
        <p>
          Most records in {APP_NAME} are about children. Schools collect them as part of educating and caring for the child, and parents give consent on the school&apos;s admission form. Children&apos;s data is never sold, never used
          for advertising, and never shown to anyone outside the child&apos;s school except the service providers listed below, who handle it only to run the service.
        </p>
      </Clause>
      <Clause n={4} title="How it's protected">
        <p>
          Every school&apos;s records are walled off from every other school&apos;s in the database itself. Data is encrypted in transit and at rest. Staff see only what their role allows. {COMPANY} staff cannot see inside a
          school unless the school&apos;s proprietor opens access for support, for a limited time, and everything they do is recorded in the school&apos;s own activity log.
        </p>
      </Clause>
      <Clause n={5} title="Service providers">
        <p>We use these companies to run {APP_NAME}. Some are outside Nigeria; transfers rely on the safeguards the NDPA allows, including contractual protections.</p>
        <div className="overflow-x-auto rounded-chunk border border-line">
          <table className="w-full min-w-[480px] fs-14.5">
            <thead className="bg-paper text-left text-ink">
              <tr>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">What for</th>
                <th className="px-3 py-2">Where</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map((p) => (
                <tr key={p.name} className="border-t border-line">
                  <td className="px-3 py-2 text-ink">{p.name}</td>
                  <td className="px-3 py-2">{p.does}</td>
                  <td className="px-3 py-2">{p.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Clause>
      <Clause n={6} title="How long it's kept">
        <div className="overflow-x-auto rounded-chunk border border-line">
          <table className="w-full min-w-[480px] fs-14.5">
            <tbody>
              {RETENTION.map((r) => (
                <tr key={r.what} className="border-t border-line first:border-t-0">
                  <td className="px-3 py-2 text-ink">{r.what}</td>
                  <td className="px-3 py-2">{r.keep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Clause>
      <Clause n={7} title="Your rights">
        <p>
          Under the NDPA you can ask for a copy of the data held about you or your child, have it corrected, object to its use, ask for it to be deleted where the law allows, and take it elsewhere. Ask the school; it can
          download everything it holds about a person from {APP_NAME} for you. If you aren&apos;t satisfied, you can complain to the Nigeria Data Protection Commission.
        </p>
      </Clause>
      <Clause n={8} title="If something goes wrong">
        <p>If personal data is ever exposed, we tell the affected schools straight away, and the school and we notify the Nigeria Data Protection Commission within 72 hours where the law requires it.</p>
      </Clause>
    </LegalPage>
  );
}
