"use client";

import { useState, useTransition } from "react";
import { setTextSizeAction } from "@/app/theme-actions";
import { cn } from "@/lib/cn";

type Size = "small" | "default" | "large";
const OPTIONS: { value: Size; label: string; sample: string }[] = [
  { value: "small", label: "Small", sample: "fs-13" },
  { value: "default", label: "Default", sample: "fs-15" },
  { value: "large", label: "Large", sample: "fs-17" },
];

export function TextSizeSwitch({ initial }: { initial: Size }) {
  const [current, setCurrent] = useState<Size>(initial);
  const [, startTransition] = useTransition();
  return (
    <div role="radiogroup" aria-label="Text size" className="inline-flex rounded-chunk border border-line bg-paper p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={current === o.value}
          onClick={() => {
            setCurrent(o.value);
            const root = document.documentElement;
            if (o.value === "default") root.removeAttribute("data-text-size");
            else root.setAttribute("data-text-size", o.value);
            startTransition(() => setTextSizeAction(o.value));
          }}
          className={cn("inline-flex h-9 items-center rounded-[9px] px-3.5 font-medium text-muted transition-colors hover:text-ink", o.sample, current === o.value && "bg-canvas text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
