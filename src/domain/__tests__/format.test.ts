import { describe, expect, it } from "@jest/globals";

import {
  formatDecimal1,
  formatInt,
  formatSigned,
  formatUpTo1,
} from "@/domain/format";

describe("format (CLAUDE.md number style)", () => {
  it("uses a dot as thousands separator", () => {
    expect(formatInt(0)).toBe("0");
    expect(formatInt(999)).toBe("999");
    expect(formatInt(2056)).toBe("2.056");
    expect(formatInt(1234567)).toBe("1.234.567");
    expect(formatInt(-1500)).toBe("−1.500");
    expect(formatInt(2555.6)).toBe("2.556");
  });

  it("signs calorie adjustments", () => {
    expect(formatSigned(300)).toBe("+300");
    expect(formatSigned(-500)).toBe("−500");
    expect(formatSigned(0)).toBe("0");
  });

  it("shows one decimal with a comma", () => {
    expect(formatDecimal1(22.857)).toBe("22,9");
    expect(formatDecimal1(17)).toBe("17,0");
  });

  it("shows up to one decimal for logged grams", () => {
    expect(formatUpTo1(25)).toBe("25");
    expect(formatUpTo1(25.25)).toBe("25,3");
    expect(formatUpTo1(0.3)).toBe("0,3");
    expect(formatUpTo1(1234.5)).toBe("1.234,5");
    expect(formatUpTo1(19.96)).toBe("20");
    expect(formatUpTo1(-0.5)).toBe("−0,5");
  });
});
