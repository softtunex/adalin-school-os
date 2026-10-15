"use client";

import { useState, useTransition } from "react";
import { setThemeAction } from "@/app/theme-actions";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./ui/icons";

export type Theme = "light" | "dark" | "system";
const OPTIONS: { value: Theme; icon: IconName; label: string }[] = [
  { value: "light", icon: "sun", label: "Light" },
  { value: "dark", icon: "moon", label: "Dark" },
  { value: "system", icon: "monitor", label: "System" },
];

export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [current, setCurrent] = useState<Theme>(initial);
  const [, startTransition] = useTransition();

  function choose(theme: Theme) {
    setCurrent(theme);
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    startTransition(() => setThemeAction(theme));
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-chunk border-2 border-line p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={current === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => choose(o.value)}
          className={cn(
            "grid h-8 flex-1 place-items-center rounded-[10px] text-muted transition-colors hover:text-ink",
            current === o.value && "bg-sunken text-ink",
          )}
        >
          <Icon name={o.icon} size={17} />
        </button>
      ))}
    </div>
  );
}
