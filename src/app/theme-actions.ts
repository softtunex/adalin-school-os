"use server";

import { cookies } from "next/headers";

export async function setTextSizeAction(size: "small" | "default" | "large") {
  const jar = await cookies();
  if (size === "default") jar.delete("text-size");
  else jar.set("text-size", size === "small" ? "small" : "large", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

export async function setThemeAction(theme: "light" | "dark") {
  (await cookies()).set("theme", theme === "dark" ? "dark" : "light", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
