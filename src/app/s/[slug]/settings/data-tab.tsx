import { Card, EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/button-styles";
import { getDb } from "@/lib/db/client";
import type { Access } from "@/lib/services/access";
import { exportHistory } from "@/lib/services/data-export";

const when = (d: Date) => d.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

/** Data & privacy: take everything away, answer a person's request for their data, and see who did. */
export async function DataTab({ slug, access }: { slug: string; access: Access }) {
  const history = await exportHistory(getDb(), access);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="fs-16 font-semibold text-ink">Download all your data</h2>
          <p className="fs-14.5 text-body">
            Everything your school has in Adalin SchoolHub: students, parents, staff, classes, scores, results, attendance, fees and payments, and every other record, as spreadsheet files in one ZIP. It&apos;s yours to keep, move to
            another system, or hand to an auditor.
          </p>
          <p className="fs-13.5 text-muted">Passwords, PINs and payment links are left out. The download is recorded in your activity log.</p>
          <a href={`/s/${slug}/data-export`} download className={buttonClass("primary", "md", "self-start")}>
            <Icon name="download" size={18} /> Download everything
          </a>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="fs-16 font-semibold text-ink">When someone asks for their data</h2>
          <p className="fs-14.5 text-body">
            Under the Nigeria Data Protection Act, a parent, student or member of staff can ask for a copy of what you hold about them. Answer promptly.
          </p>
          <ul className="flex flex-col gap-1.5 fs-14.5 text-body">
            <li className="flex gap-2">
              <Icon name="check" size={16} className="mt-1 shrink-0 text-success" />
              For a student: open their profile and choose <strong className="font-semibold text-ink">Download their data</strong>. It includes their parents&apos; details.
            </li>
            <li className="flex gap-2">
              <Icon name="check" size={16} className="mt-1 shrink-0 text-success" />
              For staff: on the Staff page, open the person&apos;s menu and choose <strong className="font-semibold text-ink">Download their data</strong>.
            </li>
          </ul>
          <p className="fs-13.5 text-muted">Check who is asking before you send it, and send it only to them.</p>
        </Card>
      </div>
      <Card className="flex flex-col gap-2 p-5">
        <h2 className="fs-16 font-semibold text-ink">How Adalin looks after your data</h2>
        <ul className="grid gap-x-8 gap-y-1.5 fs-14 text-body md:grid-cols-2">
          <li>Each school&apos;s records are walled off from every other school&apos;s in the database itself.</li>
          <li>Data is encrypted on its way to you and where it is stored.</li>
          <li>Adalin staff can&apos;t see inside your school unless you let support in (Plan &amp; billing).</li>
          <li>We never sell your data or use it for advertising.</li>
        </ul>
      </Card>
      <TableCard title="Downloads">
        {history.length === 0 ? (
          <EmptyState icon="download" title="No downloads yet">
            Every download of school or personal data is listed here.
          </EmptyState>
        ) : (
          <Table minWidth="min-w-[560px]">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>What</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap text-body">{when(h.at)}</Td>
                  <Td className="text-ink">{h.summary}</Td>
                  <Td className="text-body">{h.by}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}
