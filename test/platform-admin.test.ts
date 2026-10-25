import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";

describe("who gets the Adalin admin console", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets in flagged users and listed emails (any case), and nobody else", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", " Olatunji.Buari@adalintech.com , ops@adalintech.com ");
    expect(isPlatformAdmin({ email: "olatunji.buari@adalintech.com", isPlatformAdmin: false })).toBe(true);
    expect(isPlatformAdmin({ email: "OPS@ADALINTECH.COM", isPlatformAdmin: false })).toBe(true);
    expect(isPlatformAdmin({ email: "director@demo.adalinschoolhub.ng", isPlatformAdmin: true })).toBe(true);
    expect(isPlatformAdmin({ email: "proprietor@school.ng", isPlatformAdmin: false })).toBe(false);
    expect(isPlatformAdmin({ email: null, isPlatformAdmin: false })).toBe(false);
  });

  it("lets nobody in by email when the list is empty", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    expect(isPlatformAdmin({ email: "", isPlatformAdmin: false })).toBe(false);
  });
});
