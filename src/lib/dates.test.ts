import { describe, expect, it } from "vitest";
import { formatShort, formatTime, formatWhen } from "./dates";

// 16 Oct 2026, 2:30 pm in Lagos (13:30 UTC).
const now = new Date("2026-10-16T13:30:00Z");
const at = (iso: string) => new Date(iso);

describe("dates", () => {
  it("uses a 12-hour clock in Lagos time", () => {
    expect(formatTime(at("2026-10-16T13:09:00Z"))).toBe("2:09 pm");
    expect(formatTime(at("2026-10-16T08:05:00Z"))).toBe("9:05 am");
    expect(formatTime(at("2026-10-15T23:30:00Z"))).toBe("12:30 am");
  });

  it("says recent times in words", () => {
    expect(formatWhen(at("2026-10-16T13:29:40Z"), { now })).toBe("Just now");
    expect(formatWhen(at("2026-10-16T13:25:00Z"), { now })).toBe("5 min ago");
    expect(formatWhen(at("2026-10-16T08:05:00Z"), { now })).toBe("Today, 9:05 am");
    expect(formatWhen(at("2026-10-15T15:30:00Z"), { now })).toBe("Yesterday, 4:30 pm");
    expect(formatWhen(at("2026-10-12T08:15:00Z"), { now })).toBe("Mon, 9:15 am");
    expect(formatWhen(at("2026-09-02T13:09:00Z"), { now })).toBe("2 Sept, 2:09 pm");
    expect(formatWhen(at("2025-10-12T13:09:00Z"), { now })).toBe("12 Oct 2025");
    expect(formatWhen(at("2026-10-16T13:25:00Z"), { now, relative: false })).toBe("Today, 2:25 pm");
  });

  it("keeps inbox times short", () => {
    expect(formatShort(at("2026-10-16T13:20:00Z"), now)).toBe("10 min");
    expect(formatShort(at("2026-10-16T09:00:00Z"), now)).toBe("10:00 am");
    expect(formatShort(at("2026-10-15T09:00:00Z"), now)).toBe("Yesterday");
    expect(formatShort(at("2026-10-01T09:00:00Z"), now)).toBe("1 Oct");
  });
});
