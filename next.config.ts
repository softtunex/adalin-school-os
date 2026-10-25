import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // A stamp unique to each build: the service worker's cache is named after it, so every release
  // clears the app code browsers saved for offline use (a redeploy can reuse file names).
  env: { NEXT_PUBLIC_BUILD_STAMP: process.env.VERCEL_DEPLOYMENT_ID ?? String(Date.now()) },
  // Browser tests run a second dev server alongside yours; it builds into its own folder.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The dev badge sat over the phone tab bar; errors still show their overlay.
  devIndicators: false,
  // Student imports allow 5 MB spreadsheets; leave headroom for multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // Fixed security headers on every response; the per-page Content-Security-Policy is set in src/proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "@node-rs/argon2", "exceljs", "@react-pdf/renderer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
