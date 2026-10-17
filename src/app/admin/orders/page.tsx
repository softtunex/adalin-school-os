import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { Badge, EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { addonByKey } from "@/lib/services/addons";
import { listDeliveries } from "@/lib/services/platform";
import { DeliveredButton } from "../admin-client";
import { when } from "../shared";

export const metadata = { title: "Add-on orders" };

/** Paid one-off services (setup, PIN cards) that someone at Adalin has to deliver. */
export default async function AdminOrders() {
  const rows = await listDeliveries(getDb());
  const waiting = rows.filter((r) => !r.addon.deliveredAt).length;
  return (
    <>
      <Topbar title="Add-on orders" context={waiting ? `${waiting} to deliver` : "All delivered"} />
      <PageBody>
        <TableCard>
          {rows.length === 0 ? (
            <EmptyState icon="box" title="No orders yet">
              Paid setup and PIN card orders show here for the team to deliver.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>School</Th>
                  <Th>Contact</Th>
                  <Th>Paid</Th>
                  <Th className="w-44 text-right">Delivery</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ addon, school, schoolId, phone, email }) => (
                  <tr key={addon.id} className="hover:bg-paper">
                    <Td>
                      <span className="font-medium text-ink">{addonByKey(addon.key)?.name ?? addon.key}</span>
                      {addon.note ? <span className="block fs-13 text-muted">{addon.note}</span> : null}
                    </Td>
                    <Td>
                      <Link href={`/admin/schools/${schoolId}`} className="text-ink hover:underline">
                        {school}
                      </Link>
                    </Td>
                    <Td className="text-body">{[phone, email].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td className="text-body">{when(addon.createdAt)}</Td>
                    <Td className="text-right">{addon.deliveredAt ? <Badge tone="success">Delivered {when(addon.deliveredAt)}</Badge> : <DeliveredButton addonId={addon.id} />}</Td>
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
