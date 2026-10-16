import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { AppError } from "./errors";

/*
 * Private documents (homework, lesson notes, materials, admission papers). Browsers upload
 * straight to storage: a presigned R2 URL in production (Vercel caps request bodies at
 * ~4.5 MB), a local endpoint in development. Nothing here is public; downloads go through
 * an access-checked route.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;

export const DOC_TYPES = {
  pdf: { mime: "application/pdf", kind: "pdf" },
  doc: { mime: "application/msword", kind: "ole" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "zip" },
  xls: { mime: "application/vnd.ms-excel", kind: "ole" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "zip" },
  ppt: { mime: "application/vnd.ms-powerpoint", kind: "ole" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "zip" },
  png: { mime: "image/png", kind: "png" },
  jpg: { mime: "image/jpeg", kind: "jpg" },
  jpeg: { mime: "image/jpeg", kind: "jpg" },
  webp: { mime: "image/webp", kind: "webp" },
  txt: { mime: "text/plain", kind: "text" },
} as const;
export type DocExt = keyof typeof DOC_TYPES;
export const ACCEPT = Object.keys(DOC_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export function docExt(name: string): DocExt | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ext in DOC_TYPES ? (ext as DocExt) : null;
}

/** Checks the first bytes match the claimed type, so a renamed program can't pass as a PDF. */
export function sniffMatches(ext: DocExt, head: Uint8Array): boolean {
  const b = head;
  switch (DOC_TYPES[ext].kind) {
    case "pdf":
      return String.fromCharCode(...b.slice(0, 5)) === "%PDF-";
    case "zip":
      return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
    case "ole":
      return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
    case "png":
      return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    case "jpg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "webp":
      return String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
    case "text":
      return !b.slice(0, 512).includes(0);
  }
}

function r2() {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: key, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket } = process.env;
  if (!account || !key || !secret || !bucket) return null;
  return { client: new AwsClient({ accessKeyId: key, secretAccessKey: secret, service: "s3", region: "auto" }), base: `https://${account}.r2.cloudflarestorage.com/${bucket}` };
}

function localDir() {
  return path.resolve(process.env.FILES_DIR ?? path.join(process.cwd(), ".data", "files"));
}

function localPath(key: string) {
  const target = path.resolve(localDir(), key);
  if (!target.startsWith(localDir() + path.sep)) throw new AppError("Invalid file.", "invalid");
  return target;
}

export function storageConfigured() {
  return !!r2() || process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_DB === "1";
}

export function newStorageKey(schoolId: string, ext: DocExt) {
  return `${schoolId}/${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${ext}`;
}

/** Where the browser PUTs the bytes. */
export async function uploadUrl(fileId: string, key: string, mime: string) {
  const store = r2();
  if (!store) return { url: `/api/uploads/${fileId}`, headers: { "content-type": mime } };
  const signed = await store.client.sign(new Request(`${store.base}/${key}?X-Amz-Expires=900`, { method: "PUT", headers: { "content-type": mime } }), {
    aws: { signQuery: true },
  });
  return { url: signed.url, headers: { "content-type": mime } };
}

/** Development only: the local stand-in for the R2 upload. */
export async function writeLocal(key: string, bytes: Uint8Array) {
  if (r2()) throw new AppError("Uploads go to cloud storage.", "invalid");
  const target = localPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

/** Size and first bytes of an uploaded object, or null when nothing was uploaded. */
export async function inspectStored(key: string): Promise<{ size: number; head: Uint8Array } | null> {
  const store = r2();
  if (store) {
    const res = await store.client.fetch(`${store.base}/${key}`, { headers: { range: "bytes=0-511" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new AppError("We couldn't check that upload. Please try again.", "invalid");
    const total = Number(res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length") ?? 0);
    return { size: total, head: new Uint8Array(await res.arrayBuffer()) };
  }
  try {
    const target = localPath(key);
    const { size } = await stat(target);
    const fh = await open(target, "r");
    try {
      const head = new Uint8Array(512);
      const { bytesRead } = await fh.read(head, 0, 512, 0);
      return { size, head: head.slice(0, bytesRead) };
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

/** A download: a short-lived signed URL in production, the bytes themselves locally. */
export async function downloadStored(key: string, name: string, mime: string, inline: boolean): Promise<{ redirect: string } | { bytes: Uint8Array }> {
  const disposition = `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\w.\- ]/g, "_")}"`;
  const store = r2();
  if (store) {
    const q = new URLSearchParams({ "X-Amz-Expires": "300", "response-content-disposition": disposition, "response-content-type": mime });
    const signed = await store.client.sign(new Request(`${store.base}/${key}?${q}`, { method: "GET" }), { aws: { signQuery: true } });
    return { redirect: signed.url };
  }
  return { bytes: new Uint8Array(await readFile(localPath(key))) };
}

export async function deleteStored(key: string) {
  const store = r2();
  if (store) {
    await store.client.fetch(`${store.base}/${key}`, { method: "DELETE" }).catch(() => null);
    return;
  }
  await rm(localPath(key), { force: true }).catch(() => null);
}
