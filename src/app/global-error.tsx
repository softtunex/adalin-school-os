"use client";

import { useEffect } from "react";
import { reportBrowserError } from "@/lib/report-browser-error";

/** Last resort when even the root layout fails: plain markup, no app styles to rely on. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportBrowserError(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, display: "grid", placeItems: "center", minHeight: "100dvh", padding: 20, color: "#1d1d1f" }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#4a4a4f", margin: "0 0 16px" }}>
            Adalin SchoolHub couldn&apos;t load. Try again, and if it keeps happening, contact support{error.digest ? ` with code ${error.digest}` : ""}.
          </p>
          <button onClick={reset} style={{ background: "#b84300", color: "#fff", border: 0, borderRadius: 12, padding: "12px 20px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
