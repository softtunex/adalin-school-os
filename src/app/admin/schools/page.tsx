import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { plans } from "@/lib/db/schema";
import { formatNaira } from "@/lib/money";
import { listSchools, SCHOOL_PAGE_SIZE } from "@/lib/services/platform";
import { SchoolStatus, when } from "../shared";

export const metadata = { title: "Schools" };

type SP = { q?: string; plan?: string; status?: string; page?: string };

export default async function AdminSchools({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const db = getDb();
  const [allPlans, { rows, total }] = await Promise.all([
    db.select().from(plans).orderBy(plans.sort),
    listSchools(db, { q: sp.q, plan: sp.plan, status: sp.status, page: Number(sp.page) || 1 }),
  ]);
  const query = new URLSearchParams(Object.entries({ q: sp.q, plan: sp.plan, status: sp.status }).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return (
    <>
      <Topbar title="Schools" context={`${total} ${total === 1 ? "school" : "schools"}`} />
      <PageBody>
        <TableCard
          toolbar={
            <>
              <SearchInput placeholder="Name, code, email or city…" />
              <FilterSelect label="Plan" param="plan" options={allPlans.map((p) => ({ value: p.key, label: p.name }))} />
              <FilterSelect
                label="Status"
                param="status"
                options={[
                  { value: "active", label: "Active" },
                  { value: "trial", label: "On trial" },
                  { value: "owing", label: "Owing" },
                  { value: "read_only", label: "Read-only" },
                  { value: "suspended", label: "Suspended" },
                ]}
              />
              <ToolbarLink href={`/admin/schools/export${query ? `?${query}` : ""}`} icon="download">
                Export
              </ToolbarLink>
            </>
          }
          footer={<Pagination page={Number(sp.page) || 1} pageSize={SCHOOL_PAGE_SIZE} total={total} noun="schools" />}
        >
          {rows.length === 0 ? (
            <EmptyState icon="school" title="No schools match">
              Try a different search or clear the filters.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>School</Th>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Students</Th>
                  <Th className="text-right">Staff</Th>
                  <Th className="text-right">Owing</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ school, students, staff, owed }) => (
                  <tr key={school.id} className="hover:bg-paper">
                    <Td>
                      <Link href={`/admin/schools/${school.id}`} className="font-medium text-ink hover:underline">
                        {school.name}
                      </Link>
                      <span className="block fs-13 text-muted">{[school.slug, school.city].filter(Boolean).join(" · ")}</span>
                    </Td>
                    <Td className="text-body">
                      <span className="capitalize">{school.planKey}</span>
                      {school.pendingPlanKey ? <span className="block fs-12.5 text-muted">To {school.pendingPlanKey} next term</span> : null}
                    </Td>
                    <Td>
                      <SchoolStatus status={school.status} trialEndsAt={school.trialEndsAt} />
                    </Td>
                    <Td className="text-right tabular text-body">{students}</Td>
                    <Td className="text-right tabular text-body">{staff}</Td>
                    <Td className={owed ? "text-right tabular font-semibold text-ink" : "text-right tabular text-muted"}>{owed ? formatNaira(owed) : "—"}</Td>
                    <Td className="text-body">{when(school.createdAt)}</Td>
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
