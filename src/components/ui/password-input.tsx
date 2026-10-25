"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Input } from "./form";
import { Icon } from "./icons";

/** A password field with a show/hide eye, so people can check what they typed. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-controls={props.id}
        // Worded without "password" so the field's own label stays the only one that says it.
        aria-label={shown ? "Hide what you typed" : "Show what you typed"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[inherit] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
      >
        <Icon name={shown ? "eyeOff" : "eye"} size={18} />
      </button>
    </div>
  );
}
