import "server-only";
import { cookies } from "next/headers";

export type Theme = "light" | "dark";

export type TextSize = "small" | "default" | "large";

export async function getTextSize(): Promise<TextSize> {
  const v = (await cookies()).get("text-size")?.value;
  return v === "small" || v === "large" ? v : "default";
}

/** Light unless the person has explicitly chosen dark. */
export async function getTheme(): Promise<Theme> {
  return (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
}
