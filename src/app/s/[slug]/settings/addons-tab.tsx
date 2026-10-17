import Link from "next/link";
import { Badge, Card, EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon, type IconName } from "@/components/ui/icons";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import type { Access } from "@/lib/services/access";
import { addonsOverview } from "@/lib/services/addons";
import { AddonBuy, AddonStop } from "./addons-client";

const ICON: Record<string, IconName> = { brand_theme: "star", setup_remote: "monitor", setup_onsite: "users", pin_cards: "key" };

/** Extras on top of the plan: buy, see what's on, stop a term add-on. */
export async function AddonsTab({ slug, access }: { slug: string; access: Access }) {
  const o = await addonsOverview(getDb(), access);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="fs-16 font-semibold">Add-ons</h2>
        <p className="mt-1 fs-14 text-muted">Extras on top of your plan. Term add-ons are billed with your plan each term; services are paid once and we arrange them with you.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {o.catalogue.map((a) => {
          const pending = o.bought.find((b) => b.key === a.key && b.status === "pending" && b.bill?.status === "open");
          return (
            <Card key={a.key} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-chunk bg-brand-wash text-brand">
                  <Icon name={ICON[a.key] ?? "plus"} size={21} />
                </span>
                {a.inPlan ? <Badge tone="success">In your plan</Badge> : a.active ? <Badge tone="success">On</Badge> : pending ? <Badge tone="warning">Waiting for payment</Badge> : null}
              </div>
              <div className="flex-1">
                <h3 className="fs-16 font-semibold text-ink">{a.name}</h3>
                <p className="mt-1 fs-14 text-body">{a.description}</p>
              </div>
              <p className="tabular fs-18 font-bold text-ink">
                {formatNaira(a.priceKobo)}
                <span className="ml-1 fs-13 font-normal text-muted">{a.billing === "term" ? "a term" : a.unit ? `per ${a.unit.size} ${a.unit.label}` : "once"}</span>
              </p>
              {a.inPlan || a.active ? null : <AddonBuy slug={slug} addonKey={a.key} name={a.name} price={a.priceKobo} billing={a.billing} unit={a.unit ?? null} pendingBillId={pending?.bill?.id ?? null} />}
            </Card>
          );
        })}
        <Card className="flex flex-col gap-3 p-5">
          <span className="grid size-11 place-items-center rounded-chunk bg-brand-wash text-brand">
            <Icon name="chat" size={21} />
          </span>
          <div className="flex-1">
            <h3 className="fs-16 font-semibold text-ink">SMS and WhatsApp credits</h3>
            <p className="mt-1 fs-14 text-body">Credits for absence alerts, fee reminders and announcements by text. Bought in packs; the more you buy, the cheaper each one.</p>
          </div>
          <Link href={`/s/${slug}/settings?tab=messaging`} className="inline-flex items-center gap-1.5 fs-14.5 font-semibold text-brand-ink hover:underline">
            Buy credits under Messaging <Icon name="chevronRight" size={16} />
          </Link>
        </Card>
      </div>

      <TableCard title="Your add-ons">
        {o.bought.length === 0 ? (
          <EmptyState icon="plus" title="Nothing yet">
            Add-ons you buy show here with their bill and whether they&apos;re on.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Add-on</Th>
                <Th>Bill</Th>
                <Th>Status</Th>
                <Th className="w-36">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {o.bought.map((b) => (
                <tr key={b.id} className="hover:bg-paper">
                  <Td>
                    <span className="block font-medium text-ink">{b.addon?.name ?? b.key}</span>
                    {b.note ? <span className="block fs-13 text-muted">{b.note}</span> : null}
                  </Td>
                  <Td className="text-body">{b.bill ? `${b.bill.number} · ${formatNaira(b.bill.totalKobo)}` : "—"}</Td>
                  <Td>
                    {b.status === "active" ? (
                      b.addon?.billing === "once" ? (
                        b.deliveredAt ? <Badge tone="success">Delivered</Badge> : <Badge tone="blue">Paid, we&apos;ll be in touch</Badge>
                      ) : (
                        <Badge tone="success">On</Badge>
                      )
                    ) : b.status === "cancelled" ? (
                      <Badge tone="neutral">Stopped</Badge>
                    ) : (
                      <Badge tone="warning">Waiting for payment</Badge>
                    )}
                  </Td>
                  <Td className="text-right">{b.status === "active" && b.addon?.billing === "term" ? <AddonStop slug={slug} addonId={b.id} name={b.addon.name} /> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}
