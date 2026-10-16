import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { Avatar, Card, EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { koboToInput } from "@/lib/money";
import { requireFeature } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { describeScheme, getFeeSetup, listSchemeStudents } from "@/lib/services/fees";
import { FeesTabs, gated } from "../shared";
import { NewSchemeButton, SchemeActions } from "./discounts-client";

export const metadata: Metadata = { title: "Discounts" };

export default async function DiscountsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ scheme?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["fees:view"]);
  const db = getDb();
  const result = await gated(slug, "debtors", async () => {
    requireFeature(access.plan, "debtors");
    return getFeeSetup(db, access);
  });
  if ("locked" in result) {
    return (
      <>
        <Topbar title="Discounts" context={access.school.name} />
        <PageBody>
          <FeesTabs slug={slug} current="discounts" />
          {result.locked}
        </PageBody>
      </>
    );
  }
  const setup = result.data;
  const itemName = new Map(setup.items.map((i) => [i.id, i.name]));
  const selected = setup.schemes.find((s) => s.id === sp.scheme) ?? setup.schemes.find((s) => s.students > 0);
  const members = selected ? await listSchemeStudents(db, access, selected.id) : [];
  const editable = can(access, "fees:discount");
  const items = setup.items.map((i) => ({ id: i.id, name: i.name }));

  return (
    <>
      <Topbar title="Discounts" context={access.school.name} actions={editable ? <NewSchemeButton slug={slug} items={items} /> : null} />
      <PageBody>
        <FeesTabs slug={slug} current="discounts" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <TableCard title="Discounts and scholarships">
            {setup.schemes.length === 0 ? (
              <EmptyState icon="percent" title="No discounts yet" action={editable ? <NewSchemeButton slug={slug} items={items} /> : null}>
                Set up sibling discounts, staff-child rates or scholarships once, then tick them on a student&apos;s profile. They&apos;re applied automatically when term invoices are raised.
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>What it gives</Th>
                    <Th className="text-right">Students</Th>
                    {editable ? (
                      <Th className="w-12">
                        <span className="sr-only">Actions</span>
                      </Th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {setup.schemes.map((s) => (
                    <tr key={s.id} className={s.id === selected?.id ? "bg-brand-wash/40" : "hover:bg-paper"}>
                      <Td>
                        <Link href={`?scheme=${s.id}`} scroll={false} className="font-medium hover:text-blue">
                          {s.name}
                        </Link>
                      </Td>
                      <Td className="text-body">{describeScheme(s, s.itemId ? itemName.get(s.itemId) : null)}</Td>
                      <Td className="tabular text-right">{s.students}</Td>
                      {editable ? (
                        <Td className="text-right">
                          <SchemeActions
                            slug={slug}
                            items={items}
                            scheme={{ id: s.id, name: s.name, kind: s.kind, itemId: s.itemId, percent: s.kind === "percent" ? String(s.value) : "", amount: s.kind === "fixed" ? koboToInput(s.value) : "" }}
                          />
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </TableCard>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="fs-16 font-semibold">{selected ? `On ${selected.name}` : "Who gets a discount"}</h2>
            {selected && members.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {members.map((m) => (
                  <li key={m.id}>
                    <Link href={`/s/${slug}/students/${m.id}`} className="flex items-center gap-3 py-2.5 hover:text-blue">
                      <Avatar name={`${m.firstName} ${m.lastName}`} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate fs-14.5 font-medium">
                          {m.firstName} {m.lastName}
                        </span>
                        <span className="block font-mono fs-12.5 text-muted">{m.admissionNo}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fs-14.5 text-muted">To give a student a discount, open their profile and tick it under Fees. It applies to every term invoice raised after that.</p>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
