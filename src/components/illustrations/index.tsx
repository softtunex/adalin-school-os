import { existsSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";

const EXTENSIONS = ["svg", "webp", "png"] as const;
const found = new Map<string, string | null>();

function findArtwork(name: string): string | null {
  if (process.env.NODE_ENV === "production" && found.has(name)) return found.get(name)!;
  for (const ext of EXTENSIONS) {
    if (existsSync(path.join(process.cwd(), "public", "illustrations", `${name}.${ext}`))) {
      found.set(name, `/illustrations/${name}.${ext}`);
      return `/illustrations/${name}.${ext}`;
    }
  }
  found.set(name, null);
  return null;
}

/**
 * Shows the generated artwork for `name` from public/illustrations when it exists,
 * otherwise the coded placeholder. Swapping art never needs a code change.
 */
export function Illustration({ name, fallback, alt = "", className, priority }: { name: string; fallback: ReactNode; alt?: string; className?: string; priority?: boolean }) {
  const src = findArtwork(name);
  if (!src) return <div className={className}>{fallback}</div>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} loading={priority ? "eager" : "lazy"} decoding="async" />
  );
}
