import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("shadow-card rounded-card border border-line bg-canvas", className)} {...props} />;
}

export type Tone = "neutral" | "brand" | "blue" | "success" | "warning" | "danger" | "violet";

const badgeTones: Record<Tone, string> = {
  neutral: "border-line-strong bg-paper text-body",
  brand: "border-brand/30 bg-brand-wash text-brand-ink",
  blue: "border-blue/25 bg-blue-wash text-blue",
  success: "border-success/25 bg-success-wash text-success",
  warning: "border-warning/30 bg-warning-wash text-warning",
  danger: "border-danger/25 bg-danger-wash text-danger",
  violet: "border-violet/25 bg-violet-wash text-violet",
};

/** Small status pill, e.g. "Active", "Offline". */
export function Badge({ tone = "neutral", className, dot, ...props }: ComponentProps<"span"> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 fs-12.5 font-medium", badgeTones[tone], className)}
      {...props}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {props.children}
    </span>
  );
}

/** @deprecated use Badge */
export const Chip = Badge;

const iconChipTones: Record<Tone, string> = {
  neutral: "bg-sunken text-body",
  brand: "bg-brand-wash text-brand-ink",
  blue: "bg-blue-wash text-blue",
  success: "bg-success-wash text-success",
  warning: "bg-warning-wash text-warning",
  danger: "bg-danger-wash text-danger",
  violet: "bg-violet-wash text-violet",
};

export function IconChip({ icon, tone = "neutral", size = 40, className }: { icon: IconName; tone?: Tone; size?: number; className?: string }) {
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-[11px]", iconChipTones[tone], className)} style={{ width: size, height: size }}>
      <Icon name={icon} size={Math.round(size * 0.48)} />
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  progress,
  caption,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon: IconName;
  tone?: Tone;
  progress?: { value: number; tone?: "success" | "brand" | "blue" | "warning" | "danger" };
  caption?: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <p className="fs-13.5 font-medium text-body sm:fs-14.5">{label}</p>
        <IconChip icon={icon} tone={tone} className="size-8! sm:size-10!" />
      </div>
      <p className="tabular mt-3 flex flex-wrap items-baseline gap-x-2 fs-24 font-semibold leading-none tracking-[-0.02em] text-ink sm:fs-28">
        {value}
        {sub ? <span className="fs-14 font-normal tracking-normal text-muted">{sub}</span> : null}
      </p>
      {progress ? <Progress value={progress.value} tone={progress.tone} label={typeof label === "string" ? label : undefined} /> : null}
      {caption ? <p className="mt-3 fs-12.5 text-muted sm:fs-13">{caption}</p> : null}
    </Card>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{children}</div>;
}

/** Dark summary banner, e.g. "Finish setting up your school". */
export function Banner({ icon = "sparkle", title, children, action }: { icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-card bg-gradient-to-r from-banner to-banner-2 p-5 text-white sm:p-6">
      <div aria-hidden className="absolute -right-16 -top-24 size-72 rounded-full border-[28px] border-white/[0.04]" />
      <div aria-hidden className="absolute -bottom-28 right-40 size-56 rounded-full border-[22px] border-brand/10" />
      <div className="relative flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand/20 text-[#ff9a5c]">
          <Icon name={icon} size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="fs-16 font-semibold text-white">{title}</p>
          {children ? <div className="mt-0.5 fs-14.5 text-white/75">{children}</div> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Alert({ tone = "blue", title, children, className }: { tone?: "blue" | "success" | "warning" | "danger"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const tones = {
    blue: "border-blue/25 bg-blue-wash",
    success: "border-success/25 bg-success-wash",
    warning: "border-warning/30 bg-warning-wash",
    danger: "border-danger/25 bg-danger-wash",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-chunk border px-4 py-3 fs-14.5 text-ink", tones[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title ? "mt-0.5" : null, "text-body")}>{children}</div> : null}
    </div>
  );
}

// Deep enough for white initials to meet WCAG AA (4.5:1).
const AVATAR_COLORS = ["#1670b0", "#6a4bc9", "#c2386b", "#1b7a30", "#946500", "#c2501f", "#0b7d7a", "#4a5bd0"];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter((p) => !/^(mr|mrs|ms|miss|dr|prof|chief)\.?$/i.test(p));
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Avatar({ name, size = 40, className, muted }: { name: string; size?: number; className?: string; muted?: boolean }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", muted ? "bg-sunken text-body" : "text-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: muted ? undefined : AVATAR_COLORS[h % AVATAR_COLORS.length] }}
    >
      {initials(name)}
    </span>
  );
}

/** In-content section heading for pages that don't use the top bar title alone. */
export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 fs-13 font-medium text-muted">{eyebrow}</p> : null}
        <h1 className="fs-24 font-semibold leading-tight tracking-[-0.02em] sm:fs-26">{title}</h1>
        {description ? <p className="mt-1 max-w-[64ch] fs-15 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ illustration, icon, title, children, action }: { illustration?: ReactNode; icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {illustration ?? (icon ? <IconChip icon={icon} tone="brand" size={56} className="mb-1" /> : null)}
      <h3 className="mt-4 fs-17 font-semibold">{title}</h3>
      {children ? <div className="mt-1 max-w-[46ch] fs-14.5 text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Progress({ value, tone = "success", label = "Progress" }: { value: number; tone?: "success" | "brand" | "blue" | "warning" | "danger"; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const bg = { success: "bg-success", brand: "bg-brand", blue: "bg-blue", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A card that holds a table: title row with toolbar, the table, and a footer (pagination). */
export function TableCard({ title, toolbar, children, footer }: { title?: ReactNode; toolbar?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      {title || toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          {title ? <h2 className="fs-16 font-semibold">{title}</h2> : <span />}
          {toolbar ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{toolbar}</div> : null}
        </div>
      ) : null}
      {children}
      {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
    </Card>
  );
}

export function Table({ children, className, fixed, minWidth = "min-w-[720px]" }: { children: ReactNode; className?: string; fixed?: boolean; minWidth?: string }) {
  return (
    <div className={cn("relative overflow-x-auto px-3 pb-3 sm:px-4", className)}>
      <table className={cn("w-full border-separate border-spacing-0 fs-14.5", minWidth, fixed && "table-fixed")}>{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "bg-paper px-4 py-3 text-left fs-13.5 font-medium text-muted first:rounded-l-[10px] last:rounded-r-[10px]",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-3.5 align-middle text-ink", className)} {...props} />;
}
