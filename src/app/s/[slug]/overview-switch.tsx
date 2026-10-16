import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { hasFeature } from "@/lib/plans/entitlements";
import { can, type Access } from "@/lib/services/access";

/** Today's dashboard and the term analytics are two views of the same home, for those who can see both. */
export function OverviewSwitch({ slug, access, current }: { slug: string; access: Access; current: "today" | "analytics" }) {
  if (!can(access, "school:analytics") || !hasFeature(access.plan, "analytics")) return null;
  const items = [
    { key: "today", label: "Today", icon: "grid" as const, href: `/s/${slug}` },
    { key: "analytics", label: "Analytics", icon: "activity" as const, href: `/s/${slug}/analytics` },
  ];
  return (
    <nav aria-label="Overview views" className="inline-flex self-start rounded-chunk border border-line-strong bg-paper p-1">
      {items.map((i) => {
        const on = i.key === current;
        return (
          <Link
            key={i.key}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={cn("inline-flex h-9 items-center gap-2 rounded-[10px] px-4 fs-14 font-semibold", on ? "bg-canvas text-ink shadow-card" : "text-muted hover:text-ink")}
          >
            <Icon name={i.icon} size={17} className={on ? "text-brand" : undefined} />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
