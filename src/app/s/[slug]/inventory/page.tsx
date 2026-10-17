import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Badge, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { EXPENSE_CATEGORIES } from "@/lib/db/schema";
import { formatNaira } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { inventorySettings, ITEM_PAGE_SIZE, listAssignments, listItems, listMoves, MOVE_PAGE_SIZE, storeOptions } from "@/lib/services/inventory";
import { AddItemButton, ItemActions, TakeBackButton } from "./inventory-client";
import { MOVE_LABEL, unitFor } from "./shared";

export const metadata: Metadata = { title: "Inventory" };

type SP = { tab?: string; view?: string; q?: string; category?: string; kind?: string; show?: string; page?: string };

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function InventoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["operations:inventory"]);
  if (!hasFeature(access.plan, "inventory")) {
    return (
      <>
        <Topbar title="Inventory" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="inventory" text="Know what's in the store, who has the projector, and when the chalk is about to run out." />
        </PageBody>
      </>
    );
  }
  const db = getDb();
  const tab = sp.tab === "out" || sp.tab === "history" ? sp.tab : "items";
  const base = `/s/${slug}/inventory`;
  const s = inventorySettings(access.school.inventorySettings);
  const lists = { categories: s.categories, locations: s.locations };
  const page = Number(sp.page) || 1;
  const store = await listItems(db, access, tab === "items" ? { q: sp.q, category: sp.category, kind: sp.kind, show: sp.show, page } : {});
  return (
    <>
      <Topbar title="Inventory" context={access.school.name} actions={<AddItemButton slug={slug} lists={lists} />} />
      <PageBody>
        <StatGrid>
          <StatCard label="Items" value={store.stats.items} icon="box" tone="brand" caption="In the store's records" />
          <StatCard label="Worth" value={formatNaira(store.stats.value)} icon="banknote" tone="blue" caption="Store and signed out, at cost" />
          <StatCard label="Signed out" value={store.stats.assigned} icon="send" tone="violet" caption="Assets with staff or rooms" />
          <StatCard label="Running low" value={store.stats.low} icon="alert" tone={store.stats.low ? "warning" : "success"} caption={store.stats.low ? "At or below the reorder level" : "Nothing to reorder"} />
        </StatGrid>
        <Tabs
          current={tab}
          tabs={[
            { key: "items", label: "Store", href: base },
            { key: "out", label: "Signed out", href: `${base}?tab=out`, count: store.stats.assigned },
            { key: "history", label: "History", href: `${base}?tab=history` },
          ]}
        />
        {tab === "out" ? <SignedOut slug={slug} access={access} sp={sp} /> : tab === "history" ? <History slug={slug} access={access} sp={sp} /> : <Items slug={slug} access={access} store={store} sp={sp} lists={lists} recordPurchases={s.recordPurchases} />}
      </PageBody>
    </>
  );
}

async function Items({ slug, access, store, sp, lists, recordPurchases }: { slug: string; access: Access; store: Awaited<ReturnType<typeof listItems>>; sp: SP; lists: { categories: string[]; locations: string[] }; recordPurchases: boolean }) {
  const { staff } = await storeOptions(getDb(), access);
  const filtered = Boolean(sp.q || sp.category || sp.kind || sp.show);
  const expenseCategories = access.plan.features.includes("expenses") ? EXPENSE_CATEGORIES.filter((c) => c !== "Salaries and wages") : [];
  return (
    <TableCard
      title="Store"
      toolbar={
        <>
          <SearchInput placeholder="Item, tag or place…" />
          <FilterSelect label="Category" param="category" options={store.categories.map((c) => ({ value: c, label: c }))} />
          <FilterSelect
            label="Kind"
            param="kind"
            options={[
              { value: "consumable", label: "Used up" },
              { value: "asset", label: "Assets" },
            ]}
          />
          <FilterSelect
            label="Show"
            param="show"
            options={[
              { value: "low", label: "Running low" },
              { value: "out", label: "Signed out" },
              { value: "damaged", label: "Damaged or lost" },
            ]}
          />
          <ToolbarLink href={`/s/${slug}/inventory/export`} icon="download">
            Export
          </ToolbarLink>
        </>
      }
      footer={<Pagination page={Number(sp.page) || 1} pageSize={ITEM_PAGE_SIZE} total={store.total} noun="items" />}
    >
      {store.rows.length === 0 ? (
        <EmptyState icon="box" title={filtered ? "Nothing matches" : "The store is empty"}>
          {filtered ? "Try a different search or clear the filters." : "Add what's in the store: chalk, exercise books, projectors, chairs. Then issue and sign things out from here."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Category</Th>
              <Th className="text-right">In store</Th>
              <Th className="text-right">Signed out</Th>
              <Th className="text-right">Cost each</Th>
              <Th className="w-44">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {store.rows.map(({ item, out }) => {
              const low = item.kind === "consumable" && item.reorderLevel > 0 && item.quantity <= item.reorderLevel;
              return (
                <tr key={item.id} className="hover:bg-paper">
                  <Td>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{item.name}</span>
                      {item.kind === "asset" ? <Badge tone="blue">Asset</Badge> : null}
                      {item.condition !== "good" ? <Badge tone={item.condition === "fair" ? "warning" : "danger"}>{item.condition[0].toUpperCase() + item.condition.slice(1)}</Badge> : null}
                    </span>
                    <span className="block fs-13 text-muted">{[item.tag, item.location].filter(Boolean).join(" · ") || " "}</span>
                  </Td>
                  <Td className="text-body">{item.category ?? "—"}</Td>
                  <Td className="text-right">
                    <span className={cn("tabular font-semibold", low ? "text-danger" : item.quantity ? "text-ink" : "text-muted")}>{item.quantity}</span>
                    <span className="text-muted"> {unitFor(item.quantity, item.unit)}</span>
                    {low ? <span className="block fs-12.5 font-medium text-danger">Reorder (at {item.reorderLevel})</span> : null}
                  </Td>
                  <Td className="text-right tabular text-body">{item.kind === "asset" ? out : "—"}</Td>
                  <Td className="text-right tabular text-body">{item.unitCostKobo ? formatNaira(item.unitCostKobo) : "—"}</Td>
                  <Td>
                    <ItemActions
                      slug={slug}
                      lists={lists}
                      staff={staff}
                      recordPurchases={recordPurchases && expenseCategories.length > 0}
                      expenseCategories={expenseCategories}
                      item={{
                        id: item.id,
                        name: item.name,
                        kind: item.kind,
                        unit: item.unit,
                        quantity: item.quantity,
                        out,
                        draft: {
                          id: item.id,
                          name: item.name,
                          kind: item.kind,
                          category: item.category ?? "",
                          unit: item.unit,
                          quantity: String(item.quantity),
                          reorderLevel: String(item.reorderLevel),
                          cost: item.unitCostKobo ? String(item.unitCostKobo / 100) : "",
                          location: item.location ?? "",
                          tag: item.tag ?? "",
                          condition: item.condition,
                          note: item.note ?? "",
                        },
                      }}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}

async function SignedOut({ slug, access, sp }: { slug: string; access: Access; sp: SP }) {
  const view = sp.view === "returned" ? "returned" : "open";
  const rows = await listAssignments(getDb(), access, { view, q: sp.q });
  const base = `/s/${slug}/inventory?tab=out`;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {[
          ["open", "Signed out now"],
          ["returned", "Returned"],
        ].map(([k, l]) => (
          <Link
            key={k}
            href={k === "open" ? base : `${base}&view=${k}`}
            className={cn("inline-flex h-9 items-center rounded-full border px-3.5 fs-13.5 font-medium", view === k ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong bg-canvas text-body hover:bg-paper")}
          >
            {l}
          </Link>
        ))}
      </div>
      <TableCard title={view === "open" ? "Signed out now" : "Returned"} toolbar={<SearchInput placeholder="Item, tag, person or room…" />}>
        {rows.length === 0 ? (
          <EmptyState icon="box" title={view === "open" ? "Everything is in the store" : "Nothing returned yet"}>
            {view === "open" ? "Assets you sign out to staff or rooms show here until they come back." : "Assets that come back show here with their condition."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>With</Th>
                <Th className="text-right">How many</Th>
                <Th>Since</Th>
                <Th>{view === "open" ? "Note" : "Came back"}</Th>
                <Th className="w-40">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.a.id} className="hover:bg-paper">
                  <Td>
                    <span className="block font-medium text-ink">{r.name}</span>
                    {r.tag ? <span className="block fs-13 text-muted">{r.tag}</span> : null}
                  </Td>
                  <Td>
                    <span className="block text-ink">{r.staff ?? r.a.location}</span>
                    <span className="block fs-13 text-muted">{r.staff ? "Staff" : "Room"}</span>
                  </Td>
                  <Td className="text-right tabular">{r.a.quantity}</Td>
                  <Td className="whitespace-nowrap text-body">{day(r.a.assignedOn)}</Td>
                  <Td className="text-body">
                    {view === "open" ? (
                      (r.a.note ?? "—")
                    ) : (
                      <span className="flex items-center gap-2">
                        {day(r.a.returnedOn!)}
                        <Badge tone={r.a.returnCondition === "good" ? "success" : r.a.returnCondition === "fair" ? "warning" : "danger"}>{r.a.returnCondition}</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">{view === "open" ? <TakeBackButton slug={slug} id={r.a.id} name={r.name} /> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
    </>
  );
}

async function History({ slug, access, sp }: { slug: string; access: Access; sp: SP }) {
  const page = Number(sp.page) || 1;
  const { rows, total } = await listMoves(getDb(), access, { q: sp.q, kind: sp.kind, page });
  return (
    <TableCard
      title="History"
      toolbar={
        <>
          <SearchInput placeholder="Item, person, room or supplier…" />
          <FilterSelect label="Kind" param="kind" options={Object.entries(MOVE_LABEL).map(([value, label]) => ({ value, label }))} />
          <ToolbarLink href={`/s/${slug}/inventory/export?what=history`} icon="download">
            Export
          </ToolbarLink>
        </>
      }
      footer={<Pagination page={page} pageSize={MOVE_PAGE_SIZE} total={total} noun="moves" />}
    >
      {rows.length === 0 ? (
        <EmptyState icon="history" title="No moves yet">
          Every stock in, issue, sign-out, return and count is logged here.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Item</Th>
              <Th>What happened</Th>
              <Th className="text-right">Change</Th>
              <Th className="text-right">Store after</Th>
              <Th>By</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m.id} className="hover:bg-paper">
                <Td className="whitespace-nowrap text-body">{day(r.m.movedOn)}</Td>
                <Td className="font-medium text-ink">{r.name}</Td>
                <Td>
                  <span className="block text-ink">
                    {MOVE_LABEL[r.m.kind]}
                    {r.staff || r.m.location ? ` · ${r.staff ?? r.m.location}` : ""}
                  </span>
                  {r.m.supplier || r.m.note ? <span className="block fs-13 text-muted">{[r.m.supplier, r.m.note].filter(Boolean).join(" · ")}</span> : null}
                </Td>
                <Td className={cn("text-right tabular font-semibold", r.m.change > 0 ? "text-success-deep" : r.m.change < 0 ? "text-danger" : "text-muted")}>
                  {r.m.change > 0 ? "+" : ""}
                  {r.m.change}
                </Td>
                <Td className="text-right tabular text-body">
                  {r.m.balance} <span className="text-muted">{unitFor(r.m.balance, r.unit)}</span>
                </Td>
                <Td className="text-body">{r.by ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}
