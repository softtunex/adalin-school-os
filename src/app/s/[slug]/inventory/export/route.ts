import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { lagosToday } from "@/lib/services/attendance";
import { listItems, listMoves } from "@/lib/services/inventory";
import { MOVE_LABEL } from "../shared";

const naira = (kobo: number | null) => (kobo ? (kobo / 100).toFixed(2) : "");

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["operations:inventory"]);
  const db = getDb();
  const today = lagosToday();
  if (new URL(request.url).searchParams.get("what") === "history") {
    const { rows } = await listMoves(db, access, { all: true });
    const csv = toCsv(
      ["Date", "Item", "What happened", "Change", "Store after", "Unit", "With", "Supplier", "Cost each (NGN)", "Note", "By"],
      rows.map((r) => [r.m.movedOn, r.name, MOVE_LABEL[r.m.kind], r.m.change, r.m.balance, r.unit, r.staff ?? r.m.location ?? "", r.m.supplier ?? "", naira(r.m.unitCostKobo), r.m.note ?? "", r.by ?? ""]),
    );
    return csvResponse(`${slug}-inventory-history-${today}.csv`, csv);
  }
  const rows = [];
  for (let page = 1; ; page++) {
    const r = await listItems(db, access, { page });
    rows.push(...r.rows);
    if (rows.length >= r.total || r.rows.length === 0) break;
  }
  const csv = toCsv(
    ["Item", "Kind", "Category", "In store", "Signed out", "Unit", "Reorder at", "Cost each (NGN)", "Value (NGN)", "Kept in", "Asset tag", "Condition", "Note"],
    rows.map(({ item, out }) => [
      item.name,
      item.kind === "asset" ? "Asset" : "Consumable",
      item.category ?? "",
      item.quantity,
      out,
      item.unit,
      item.reorderLevel || "",
      naira(item.unitCostKobo),
      naira((item.quantity + out) * item.unitCostKobo),
      item.location ?? "",
      item.tag ?? "",
      item.condition,
      item.note ?? "",
    ]),
  );
  return csvResponse(`${slug}-inventory-${today}.csv`, csv);
}
