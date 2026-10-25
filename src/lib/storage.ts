import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";

export const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type ImageExt = keyof typeof IMAGE_TYPES;

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");

/** Identifies an image by its first bytes, never by the name or type the browser claims. */
export function sniffImage(bytes: Uint8Array): ImageExt | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

function cloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  return cloud && key && secret ? { cloud, key, secret } : null;
}

/** Stores an image and returns its public URL. Uses Cloudinary when configured, local disk otherwise. */
export async function storeImage(folder: string, bytes: Uint8Array, maxBytes: number): Promise<string> {
  if (bytes.byteLength > maxBytes) throw new AppError(`Images must be ${Math.round(maxBytes / 1024)} KB or smaller.`, "invalid");
  const ext = sniffImage(bytes);
  if (!ext) throw new AppError("Upload a PNG, JPG or WebP image.", "invalid");
  const name = `${randomBytes(12).toString("hex")}.${ext}`;

  const cloudinary = cloudinaryConfig();
  if (cloudinary) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const publicId = `schoolhub/${folder}/${name.replace(/\.\w+$/, "")}`;
    const toSign = `public_id=${publicId}&timestamp=${timestamp}${cloudinary.secret}`;
    const body = new FormData();
    body.set("file", new Blob([new Uint8Array(bytes)], { type: IMAGE_TYPES[ext] }), name);
    body.set("api_key", cloudinary.key);
    body.set("timestamp", timestamp);
    body.set("public_id", publicId);
    body.set("signature", createHash("sha1").update(toSign).digest("hex"));
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloud}/image/upload`, { method: "POST", body });
    if (!res.ok) {
      console.error("[storage] Cloudinary upload failed", res.status, await res.text());
      throw new AppError("We couldn't save that image. Please try again.", "invalid");
    }
    return ((await res.json()) as { secure_url: string }).secure_url;
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DB !== "1") {
    throw new AppError("Image uploads aren't configured yet.", "invalid");
  }
  const dir = path.join(LOCAL_DIR, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${folder}/${name}`;
}

/** Reads a locally stored upload (development only). Rejects any path that escapes the uploads folder. */
export async function readLocalUpload(parts: string[]) {
  const target = path.resolve(LOCAL_DIR, ...parts);
  if (!target.startsWith(LOCAL_DIR + path.sep)) return null;
  const ext = path.extname(target).slice(1) as ImageExt;
  if (!(ext in IMAGE_TYPES)) return null;
  try {
    return { bytes: await readFile(target), contentType: IMAGE_TYPES[ext] };
  } catch {
    return null;
  }
}
