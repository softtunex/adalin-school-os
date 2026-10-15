import "server-only";
import { cookies } from "next/headers";
import type { Theme } from "@/components/theme-switch";

export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get("theme")?.value;
  return value === "light" || value === "dark" ? value : "system";
}
