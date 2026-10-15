"use server";

import { cookies } from "next/headers";

export async function setThemeAction(theme: "light" | "dark" | "system") {
  const jar = await cookies();
  if (theme === "system") jar.delete("theme");
  else jar.set("theme", theme === "dark" ? "dark" : "light", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
