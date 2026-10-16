import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { Badge, EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { UpgradeCard } from "@/components/upgrade-card";
import { appUrl, requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import { listPinBatches } from "@/lib/services/pins";
import { CopyField } from "@/components/copy-field";
import { PinGenerator } from "./pin-generator";

export const metadata: Metadata = { title: "Result checker PINs" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

export default async function PinsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["results:pins"]);
  const title = (
    <span className="flex items-center gap-2">
      <Link href={`/s/${slug}/results`} className="text-muted hover:text-ink">
        Results
      </Link>
      <Icon name="chevronRight" size={18} className="text-muted" />
      Result checker PINs
    </span>
  );

  if (!hasFeature(access.plan, "result_workflow")) {
    return (
      <>
        <Topbar title={title} />
        <PageBody>
          <UpgradeCard slug={slug} feature="result_workflow" text="Sell or issue scratch-card PINs so parents can check published results online." />
        </PageBody>
      </>
    );
  }

  const batches = await listPinBatches(getDb(), access);
  const checkUrl = `${await appUrl()}/r/${slug}`;

  return (
    <>
      <Topbar title={title} />
      <PageBody>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <PinGenerator slug={slug} schoolName={access.school.name} checkUrl={checkUrl} />
          <TableCard title="Where parents check results">
            <div className="flex flex-col gap-3 px-5 pb-5">
              <p className="fs-14 text-muted">Print this address on your PIN cards and share it on WhatsApp. Results only show once a class is published.</p>
              <CopyField value={checkUrl} label="Result checker link" />
            </div>
          </TableCard>
        </div>

        <TableCard title="PIN batches">
          {batches.length === 0 ? (
            <EmptyState icon="key" title="No PINs yet">
              Generate a batch above. PINs are shown once, so download or print them straight away.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th>Term</Th>
                  <Th>PINs</Th>
                  <Th>Used</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch} className="hover:bg-paper">
                    <Td className="font-mono fs-13">{b.batch}</Td>
                    <Td>
                      {b.termName}, {b.sessionName}
                    </Td>
                    <Td className="tabular">{b.total}</Td>
                    <Td>
                      <span className="tabular">{b.used}</span> {b.exhausted ? <Badge tone="neutral">{b.exhausted} used up</Badge> : null}
                    </Td>
                    <Td className="tabular text-body">{dateFmt.format(new Date(b.createdAt))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableCard>
      </PageBody>
    </>
  );
}
