"use client";

import { useEffect } from "react";

/** Registers the offline service worker in production builds (dev rebuilds code on every change). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not supported or blocked (private mode): the app works online as normal.
    });
  }, []);
  return null;
}
