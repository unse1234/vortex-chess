import { describe, expect, it } from "vitest";
import { formatClock, formatTimeControl } from "@/utils/format-time-control";

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(222_000)).toBe("03:42");
    expect(formatClock(74_000)).toBe("01:14");
    expect(formatClock(3_600_000)).toBe("60:00");
  });

  it("shows tenths of a second only under ten seconds", () => {
    expect(formatClock(10_000)).toBe("00:10");
    expect(formatClock(9_950)).toBe("00:09.9");
    expect(formatClock(450)).toBe("00:00.4");
  });

  it("never goes negative", () => {
    expect(formatClock(-500)).toBe("00:00.0");
  });
});

describe("formatTimeControl", () => {
  it("shows category, base minutes and increment seconds", () => {
    expect(formatTimeControl({ category: "blitz", initialMs: 180_000, incrementMs: 2_000 })).toBe("BLITZ 3+2");
    expect(formatTimeControl({ category: "rapid", initialMs: 600_000, incrementMs: 0 })).toBe("RAPID 10+0");
  });
});
