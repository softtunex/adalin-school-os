import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { Icon } from "./ui/icons";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-[12px] font-black tracking-[-0.02em] text-ink">
      <span className="grid size-9 place-items-center rounded-[11px] bg-brand text-white shadow-[0_3px_0_var(--brand-deep)]">
        <Icon name="school" size={20} strokeWidth={2.4} />
      </span>
      {compact ? null : <span className="text-[19px]">{APP_NAME}</span>}
    </Link>
  );
}
