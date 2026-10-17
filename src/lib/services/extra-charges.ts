import { and, eq, inArray, ne } from "drizzle-orm";
import type { Tx } from "../db/client";
import { feeItems, invoiceLines, invoices } from "../db/schema";
import { AppError } from "../errors";
import { formatNaira } from "../money";
import { hasFeature } from "../plans/entitlements";
import { can, type Access } from "./access";
import { getCurrentTerm } from "./academics";
import { recordAudit } from "./audit";
import { refreshInvoice } from "./invoices";

export type ExtraCharge = { studentId: string; amountKobo: number; description: string };

/** Whoever raises invoices can bill extras such as the school bus or boarding. */
export function canBillExtras(access: Access) {
  return can(access, "fees:invoice") && hasFeature(access.plan, "fees_basic");
}

/**
 * Adds a charge for an optional fee item (School bus, Boarding) to each student's term invoice
 * for the current term. A student already charged for the item this term is skipped, so it's
 * safe to run again after more students join. Students without a term invoice yet are counted
 * so the bursar knows to raise theirs first.
 */
export async function chargeOnTermInvoices(tx: Tx, access: Access, itemName: string, charges: ExtraCharge[], ip?: string | null) {
  if (!canBillExtras(access)) throw new AppError("Only staff who raise invoices can add these charges.", "forbidden");
  const current = await getCurrentTerm(tx);
  if (!current) throw new AppError("Set the current term first.", "conflict");
  const wanted = charges.filter((c) => c.amountKobo > 0);
  if (!wanted.length) return { added: 0, already: 0, noInvoice: 0, totalKobo: 0, term: current.term.name };

  let [item] = await tx.select().from(feeItems).where(eq(feeItems.name, itemName));
  if (!item) [item] = await tx.insert(feeItems).values({ schoolId: access.school.id, name: itemName, isOptional: true, sort: 90 }).returning();

  const invs = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.termId, current.term.id), eq(invoices.kind, "term"), ne(invoices.status, "void"), inArray(invoices.studentId, wanted.map((c) => c.studentId))));
  const byStudent = new Map(invs.map((i) => [i.studentId, i]));
  const charged = invs.length
    ? new Set(
        (
          await tx
            .select({ invoiceId: invoiceLines.invoiceId })
            .from(invoiceLines)
            .where(and(eq(invoiceLines.itemId, item.id), inArray(invoiceLines.invoiceId, invs.map((i) => i.id))))
        ).map((l) => l.invoiceId),
      )
    : new Set<string>();

  let added = 0;
  let already = 0;
  let noInvoice = 0;
  let totalKobo = 0;
  for (const c of wanted) {
    const inv = byStudent.get(c.studentId);
    if (!inv) {
      noInvoice++;
      continue;
    }
    if (charged.has(inv.id)) {
      already++;
      continue;
    }
    await tx.insert(invoiceLines).values({ schoolId: access.school.id, invoiceId: inv.id, kind: "charge", itemId: item.id, description: c.description, amountKobo: c.amountKobo, sort: 60 });
    await refreshInvoice(tx, inv.id);
    added++;
    totalKobo += c.amountKobo;
  }
  if (added) {
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "fees.extra_charges",
      summary: `Added ${itemName} to ${added} invoice${added === 1 ? "" : "s"} for ${current.term.name} (${formatNaira(totalKobo)})`,
    });
  }
  return { added, already, noInvoice, totalKobo, term: current.term.name };
}
