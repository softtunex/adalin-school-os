import type { Metadata } from "next";
import Link from "next/link";
import { Clause, LegalPage } from "@/components/legal-page";
import { APP_NAME } from "@/lib/config";
import { COMPANY } from "@/lib/legal";

export const metadata: Metadata = { title: "Data processing agreement" };

export default function DpaPage() {
  return (
    <LegalPage
      title="Data processing agreement"
      current="/dpa"
      intro={
        <p>
          This agreement is part of the{" "}
          <Link href="/terms" className="font-semibold text-blue hover:underline">
            terms of service
          </Link>
          . It sets out how {COMPANY} (the processor) handles personal data for the school (the controller) under the Nigeria Data Protection Act 2023.
        </p>
      }
    >
      <Clause n={1} title="Instructions">
        <p>{COMPANY} processes the school&apos;s personal data only to provide {APP_NAME} and on the school&apos;s documented instructions, which include the school&apos;s use of the app&apos;s settings and features.</p>
      </Clause>
      <Clause n={2} title="Confidentiality">
        <p>
          Only {COMPANY} staff who need to, and who are bound to confidentiality, can handle the school&apos;s data. They can see inside a school only when the school&apos;s proprietor grants support access, for a limited time,
          and every action they take is recorded in the school&apos;s activity log.
        </p>
      </Clause>
      <Clause n={3} title="Security">
        <p>
          {COMPANY} keeps appropriate technical and organisational measures in place, including: separation of each school&apos;s data enforced by the database, encryption in transit and at rest, role-based access, rate limits,
          activity logging, regular backups, and testing of these measures.
        </p>
      </Clause>
      <Clause n={4} title="Sub-processors">
        <p>
          The school authorises the service providers listed in the{" "}
          <Link href="/privacy#s5" className="font-semibold text-blue hover:underline">
            privacy notice
          </Link>
          . {COMPANY} binds each to data protection terms at least as protective as these, and gives notice in the app before adding a new one, so the school can object.
        </p>
      </Clause>
      <Clause n={5} title="Helping the school">
        <p>
          {COMPANY} helps the school answer requests from people about their data (the app downloads everything held about a student or staff member), carry out impact assessments where needed, and meet its security duties.
        </p>
      </Clause>
      <Clause n={6} title="Breaches">
        <p>{COMPANY} tells the school without undue delay, and in any case within 24 hours of becoming aware, of a breach affecting its data, with what is known and what is being done, so the school can meet its 72-hour duty to the regulator.</p>
      </Clause>
      <Clause n={7} title="International transfers">
        <p>Where providers handle data outside Nigeria, transfers rely on the safeguards the NDPA allows, including contractual protections.</p>
      </Clause>
      <Clause n={8} title="End of service">
        <p>When the school&apos;s account closes, {COMPANY} deletes its personal data within 90 days, after the school has had the chance to download it, unless the law requires it to be kept.</p>
      </Clause>
      <Clause n={9} title="Audits">
        <p>{COMPANY} makes available the information needed to show it meets this agreement, and allows reasonable audits with notice.</p>
      </Clause>
    </LegalPage>
  );
}
