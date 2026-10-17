import { describe, expect, it } from "vitest";
import { brandOf, brandProblem, brandStyle, contrastWithWhite, DEFAULT_BRAND, normalizeHex, shade } from "./brand";

describe("school colours", () => {
  it("reads colour codes and refuses ones too light for white text", () => {
    expect(normalizeHex("1b2a5c")).toBe("#1B2A5C");
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("blue")).toBeNull();
    expect(brandProblem("#1B2A5C")).toBeNull();
    expect(brandProblem("#FFE600")).toMatch(/too light/);
    expect(contrastWithWhite("#FE6007")).toBeGreaterThan(3);
  });

  it("only applies a school's colour on plans that include it", () => {
    expect(brandOf({ brandColor: "#1B2A5C" }, ["brand_theme"])).toBe("#1B2A5C");
    expect(brandOf({ brandColor: "#1B2A5C" }, ["documents"])).toBe(DEFAULT_BRAND);
    expect(brandOf({ brandColor: null }, ["brand_theme"])).toBe(DEFAULT_BRAND);
    expect(brandStyle(DEFAULT_BRAND)).toBeUndefined();
    expect(brandStyle("#1B2A5C")).toMatchObject({ "--brand": "#1B2A5C", "--brand-deep": shade("#1B2A5C", 0.22) });
  });
});
