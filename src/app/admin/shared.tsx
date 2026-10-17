import { Badge, type Tone } from "@/components/ui/display";

export function when(d: Date | string | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(`${d}T12:00:00Z`) : d;
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}

export function whenTime(d: Date) {
  return d.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
}

const STATUS: Record<string, [string, Tone]> = {
  active: ["Active", "success"],
  read_only: ["Read-only", "warning"],
  suspended: ["Suspended", "danger"],
};

export function SchoolStatus({ status, trialEndsAt }: { status: string; trialEndsAt?: Date | null }) {
  const [label, tone] = STATUS[status] ?? [status, "neutral"];
  return (
    <span className="flex flex-wrap gap-1.5">
      <Badge tone={tone} dot>
        {label}
      </Badge>
      {trialEndsAt ? <Badge tone="violet">Trial to {when(trialEndsAt)}</Badge> : null}
    </span>
  );
}

const BILL: Record<string, [string, Tone]> = { open: ["Waiting", "warning"], paid: ["Paid", "success"], void: ["Cancelled", "neutral"] };

export function BillStatus({ status, dueOn, today }: { status: string; dueOn: string; today: string }) {
  if (status === "open" && dueOn < today) return <Badge tone="danger">Overdue</Badge>;
  const [label, tone] = BILL[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

export const KIND_LABEL: Record<string, string> = { term: "Term", upgrade: "Upgrade", addon: "Add-on", manual: "Manual" };
