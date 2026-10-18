import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";
import { Kola } from "./illustrations/art";

/** Product wordmark: mascot head plus the name in the rounded display face. */
export function Logo({ href = "/", compact = false, className }: { href?: string; compact?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-[12px]", className)} aria-label={`${APP_NAME} home`}>
      <Kola className="h-10 w-9 shrink-0" />
      {compact ? null : (
        <span className="whitespace-nowrap font-display fs-24 font-black leading-none tracking-[-0.02em]">
          <span className="text-ink">adalin</span> <span className="text-brand">schoolhub</span>
        </span>
      )}
    </Link>
  );
}
