import "server-only";
import { cookies } from "next/headers";

export type Theme = "light" | "dark";

/** Light unless the person has explicitly chosen dark. */
export async function getTheme(): Promise<Theme> {
  return (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
}
