"use client";

import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";

export function DatePicker({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="relative flex h-10 items-center gap-2 rounded-chunk border border-line-strong bg-canvas pl-3 pr-2 text-[14px] focus-within:border-blue">
      <Icon name="calendar" size={17} className="text-muted" />
      <span className="sr-only">Date</span>
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          router.push(v === max ? pathname : `${pathname}?date=${v}`);
        }}
        className="h-full bg-transparent font-medium text-ink focus:outline-none"
      />
    </label>
  );
}
