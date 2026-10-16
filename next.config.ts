import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser tests run a second dev server alongside yours; it builds into its own folder.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The dev badge sat over the phone tab bar; errors still show their overlay.
  devIndicators: false,
  // Student imports allow 5 MB spreadsheets; leave headroom for multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
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
