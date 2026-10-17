import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { SearchInput } from "@/components/ui/data";
import { EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { listActivity } from "@/lib/services/platform";
import { whenTime } from "../shared";

export const metadata = { title: "Activity" };

export default async function AdminActivity({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = await listActivity(getDb(), { q });
  return (
    <>
      <Topbar title="Activity" context="What the Adalin team did" />
      <PageBody>
        <TableCard toolbar={<SearchInput placeholder="Person, school or action…" />}>
          {rows.length === 0 ? (
            <EmptyState icon="history" title={q ? "Nothing matches" : "Nothing yet"} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-40">When</Th>
                  <Th>What</Th>
                  <Th>School</Th>
                  <Th>Who</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, school }) => (
                  <tr key={a.id}>
                    <Td className="whitespace-nowrap text-body">{whenTime(a.createdAt)}</Td>
                    <Td className="text-ink">{a.summary}</Td>
                    <Td>
                      {a.schoolId && school ? (
                        <Link href={`/admin/schools/${a.schoolId}`} className="text-ink hover:underline">
                          {school}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-body">{a.actorName}</Td>
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
