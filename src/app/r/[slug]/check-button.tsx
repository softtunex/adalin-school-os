"use client";

import { buttonClass } from "@/components/ui/button";

export function CheckButton() {
  return (
    <button type="submit" className={buttonClass("primary", "xl")}>
      Check result
    </button>
  );
}
