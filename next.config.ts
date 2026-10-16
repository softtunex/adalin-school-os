import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: { position: "bottom-right" },
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
