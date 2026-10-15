"use client";

import { useState, useTransition } from "react";
import { setThemeAction } from "@/app/theme-actions";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./ui/icons";

export type Theme = "light" | "dark";
const OPTIONS: { value: Theme; icon: IconName; label: string }[] = [
  { value: "light", icon: "sun", label: "Light" },
  { value: "dark", icon: "moon", label: "Dark" },
];

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [current, setCurrent] = useState<Theme>(initial);
  const [, startTransition] = useTransition();

  function choose(theme: Theme) {
    setCurrent(theme);
    applyTheme(theme);
    startTransition(() => setThemeAction(theme));
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-chunk border border-line bg-paper p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={current === o.value}
          onClick={() => choose(o.value)}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-[9px] px-3.5 text-[14px] font-medium text-muted transition-colors hover:text-ink",
            current === o.value && "bg-canvas text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
          )}
        >
          <Icon name={o.icon} size={16} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
