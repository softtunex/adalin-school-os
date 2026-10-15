"use client";

import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Icon } from "./ui/icons";

export function CopyField({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      ref.current?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-2">
      <input
        ref={ref}
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 min-w-0 flex-1 rounded-chunk border-2 border-line bg-paper px-3 font-mono text-[12.5px] text-ink"
      />
      <Button variant="secondary" onClick={copy} aria-live="polite">
        <Icon name={copied ? "check" : "copy"} size={17} />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
