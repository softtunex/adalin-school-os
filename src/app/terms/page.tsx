import type { Metadata } from "next";
import Link from "next/link";
import { Clause, LegalPage } from "@/components/legal-page";
import { APP_NAME } from "@/lib/config";
import { COMPANY, PRIVACY_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      current="/terms"
      intro={
        <p>
          These terms are between {COMPANY} and the school that signs up for {APP_NAME}. By creating a school account, the person signing up confirms they may act for the school and accepts these terms, the{" "}
          <Link href="/privacy" className="font-semibold text-blue hover:underline">
            privacy notice
          </Link>{" "}
          and the{" "}
          <Link href="/dpa" className="font-semibold text-blue hover:underline">
            data processing agreement
          </Link>
          .
        </p>
      }
    >
      <Clause n={1} title="The service">
        <p>{APP_NAME} lets a school run its records, academics, fees and communication online. Features depend on the school&apos;s plan, shown under Settings, Plan &amp; billing.</p>
      </Clause>
      <Clause n={2} title="The school's responsibilities">
        <ul className="list-disc pl-5">
          <li>Collect students&apos;, parents&apos; and staff&apos;s data lawfully, with the consents the law requires, and keep it accurate.</li>
          <li>Give staff only the access their work needs, and keep sign-in details private.</li>
          <li>Use {APP_NAME} only for running the school, and not to send unlawful or unwanted messages.</li>
        </ul>
      </Clause>
      <Clause n={3} title="Plans and payment">
        <p>
          Paid plans are charged per student on roll, per term. Bills are due 14 days after they&apos;re issued. If a bill is more than 7 days overdue, the school becomes read-only until it&apos;s paid: everything can still be
          viewed, and parents can still pay fees, but nothing can be changed. Nothing is deleted for late payment. Upgrades start at once and are charged for the rest of the term; cheaper plans start next term.
        </p>
      </Clause>
      <Clause n={4} title="The school's data">
        <p>
          The school owns its data. {COMPANY} handles it only to provide {APP_NAME}, as set out in the data processing agreement. The school can download all of it at any time under Settings, Data &amp; privacy, including when
          it leaves.
        </p>
      </Clause>
      <Clause n={5} title="Availability and support">
        <p>We work to keep {APP_NAME} available and fast, back data up, and fix problems promptly. Planned maintenance happens outside school hours where possible. Support levels depend on the plan.</p>
      </Clause>
      <Clause n={6} title="Ending">
        <p>
          A school can stop using {APP_NAME} at any time. We may suspend an account that breaks these terms or the law, after notice where we can give it. When an account closes, the school&apos;s data is deleted within 90 days,
          after it has had the chance to download it.
        </p>
      </Clause>
      <Clause n={7} title="Liability">
        <p>
          {APP_NAME} is provided with reasonable care and skill. Our total liability in any year is limited to the fees the school paid us in that year, except where the law doesn&apos;t allow a limit. Neither side is liable for
          indirect losses.
        </p>
      </Clause>
      <Clause n={8} title="Changes and law">
        <p>
          We&apos;ll give notice in the app before these terms change. They are governed by the laws of the Federal Republic of Nigeria. Questions: <strong className="select-all">{PRIVACY_EMAIL}</strong>.
        </p>
      </Clause>
    </LegalPage>
  );
}
