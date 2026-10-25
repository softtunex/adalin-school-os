"use client";

import { useEffect } from "react";

/** Registers the offline service worker in production builds (dev rebuilds code on every change). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // A new build registers a new worker, which clears the previous build's saved app code.
    const build = encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_STAMP ?? "dev");
    navigator.serviceWorker.register(`/sw.js?build=${build}`, { scope: "/" }).catch(() => {
      // Not supported or blocked (private mode): the app works online as normal.
    });
  }, []);
  return null;
}
