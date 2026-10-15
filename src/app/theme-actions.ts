"use server";

import { cookies } from "next/headers";

export async function setThemeAction(theme: "light" | "dark") {
  (await cookies()).set("theme", theme === "dark" ? "dark" : "light", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
