import type { ReactNode } from "react";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect } from "@/components/ui/data";
import { Badge, type Tone } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import type { InvoiceStatus } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { FeatureKey } from "@/lib/plans/catalog";

export const STATUS_LABEL: Record<InvoiceStatus, string> = { unpaid: "Unpaid", partial: "Part paid", paid: "Paid", void: "Void" };
const STATUS_TONE: Record<InvoiceStatus, Tone> = { unpaid: "danger", partial: "warning", paid: "success", void: "neutral" };

export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  if (overdue && (status === "unpaid" || status === "partial")) {
    return (
      <Badge tone="danger" dot>
        Overdue
      </Badge>
    );
  }
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function FeesTabs({ slug, current, termId }: { slug: string; current: string; termId?: string }) {
  const q = termId ? `?term=${termId}` : "";
  const base = `/s/${slug}/fees`;
  return (
    <Tabs
      current={current}
      tabs={[
        { key: "overview", label: "Overview", href: `${base}${q}` },
        { key: "invoices", label: "Invoices", href: `${base}/invoices${q}` },
        { key: "payments", label: "Payments", href: `${base}/payments` },
        { key: "debtors", label: "Debtors", href: `${base}/debtors${q}` },
        { key: "structure", label: "Fee structure", href: `${base}/structure${q}` },
        { key: "discounts", label: "Discounts", href: `${base}/discounts` },
      ]}
    />
  );
}

/** Term picker for the toolbar. The current term is the default, so it carries no URL parameter. */
export function TermFilter({ terms }: { terms: { id: string; label: string; isCurrent: boolean }[] }) {
  return (
    <FilterSelect
      label="Term"
      param="term"
      includeAll={false}
      options={[...terms].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)).map((t) => ({ value: t.isCurrent ? "" : t.id, label: `${t.label}${t.isCurrent ? " (current)" : ""}` }))}
    />
  );
}

/** Runs a page's data loader, turning a plan restriction into an upgrade card instead of an error page. */
export async function gated<T>(slug: string, feature: FeatureKey, load: () => Promise<T>): Promise<{ data: T } | { locked: ReactNode }> {
  try {
    return { data: await load() };
  } catch (error) {
    if (error instanceof AppError && error.code === "upgrade") {
      return { locked: <UpgradeCard slug={slug} feature={feature} text={error.message} /> };
    }
    throw error;
  }
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
