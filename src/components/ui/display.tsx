import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border-2 border-line bg-canvas", className)} {...props} />;
}

type Tone = "neutral" | "brand" | "blue" | "success" | "warning" | "danger";

const chipTones: Record<Tone, string> = {
  neutral: "border-line-strong bg-paper text-muted",
  brand: "border-brand bg-brand-wash text-brand-ink",
  blue: "border-blue bg-blue-wash text-blue",
  success: "border-success bg-success-wash text-success",
  warning: "border-warning bg-warning-wash text-warning",
  danger: "border-danger bg-danger-wash text-danger",
};

export function Chip({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex h-7 items-center gap-1 rounded-[10px] border-2 px-2.5 text-[11.5px] font-extrabold uppercase tracking-[0.05em] whitespace-nowrap", chipTones[tone], className)}
      {...props}
    />
  );
}

const alertTones: Record<Exclude<Tone, "neutral" | "brand">, string> = {
  blue: "border-blue bg-blue-wash",
  success: "border-success bg-success-wash",
  warning: "border-warning bg-warning-wash",
  danger: "border-danger bg-danger-wash",
};

export function Alert({ tone = "blue", title, children, className }: { tone?: keyof typeof alertTones; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-chunk border-2 px-4 py-3 text-[14.5px] text-ink", alertTones[tone], className)}>
      {title ? <p className="font-bold">{title}</p> : null}
      {children ? <div className={cn(title ? "mt-0.5" : null, "text-body")}>{children}</div> : null}
    </div>
  );
}

const AVATAR_COLORS = ["#1a8fd6", "#8a5cd6", "#d6457a", "#2f9e44", "#c98a00", "#e0612a", "#0f9d9a", "#5b6ee1"];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter((p) => !/^(mr|mrs|ms|miss|dr|prof|chief)\.?$/i.test(p));
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-[12px] font-black text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="label-caps mb-1 text-brand-ink">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-black leading-tight tracking-[-0.02em] sm:text-[30px]">{title}</h1>
        {description ? <p className="mt-1 max-w-[62ch] text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border-2 border-dashed border-line-strong bg-paper px-6 py-12 text-center">
      {icon ? <div className="mb-4 grid size-14 place-items-center rounded-[16px] border-2 border-brand bg-brand-wash text-brand">{icon}</div> : null}
      <h3 className="text-[18px] font-extrabold">{title}</h3>
      {children ? <div className="mt-1 max-w-[46ch] text-[15px] text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function StatTile({ label, value, children }: { label: ReactNode; value: ReactNode; children?: ReactNode }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="label-caps text-muted">{label}</p>
      <p className="tabular mt-1 text-[28px] font-black leading-none tracking-[-0.02em] text-ink">{value}</p>
      {children}
    </Card>
  );
}

export function Progress({ value, tone = "success" }: { value: number; tone?: "success" | "brand" | "blue" | "warning" | "danger" }) {
  const pct = Math.max(0, Math.min(100, value));
  const bg = { success: "bg-success", brand: "bg-brand", blue: "bg-blue", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className="mt-3 h-3 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-card border-2 border-line", className)}>
      <table className="w-full min-w-[640px] border-collapse text-[14.5px]">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("label-caps border-b-2 border-line bg-paper px-4 py-3 text-left text-muted", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", className)} {...props} />;
}
