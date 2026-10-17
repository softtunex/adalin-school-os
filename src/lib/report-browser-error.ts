/** Sends a browser error to /api/report-error without blocking anything. Server errors are reported on the server. */
export function reportBrowserError(error: Error & { digest?: string }) {
  try {
    // A digest means the server already reported it.
    if (error.digest) return;
    const body = JSON.stringify({ message: error.message, stack: error.stack, url: location.pathname });
    if (!navigator.sendBeacon?.("/api/report-error", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/report-error", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {
    // Never let reporting cause a second error.
  }
}
