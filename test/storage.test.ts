import { describe, expect, it } from "vitest";
import { readLocalUpload, sniffImage, storeImage } from "@/lib/storage";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("image uploads", () => {
  it("identifies images by their bytes, not their names", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImage(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("rejects non-images and oversized files", async () => {
    await expect(storeImage("test", new TextEncoder().encode("<html>"), 1024)).rejects.toThrow(/PNG, JPG or WebP/);
    await expect(storeImage("test", new Uint8Array(2048), 1024)).rejects.toThrow(/1 KB or smaller/);
  });

  it("stores locally and serves back only files inside the uploads folder", async () => {
    const url = await storeImage("test", PNG, 1024);
    expect(url).toMatch(/^\/uploads\/test\/[0-9a-f]{24}\.png$/);
    const parts = url.replace("/uploads/", "").split("/");
    expect((await readLocalUpload(parts))?.contentType).toBe("image/png");
    expect(await readLocalUpload(["..", "pglite", "PG_VERSION"])).toBeNull();
    expect(await readLocalUpload(["test", "..", "..", "..", "package.json"])).toBeNull();
  });
});
