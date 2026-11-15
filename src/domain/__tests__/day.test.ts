import { describe, expect, it } from "@jest/globals";

import {
  addDays,
  formatDayVi,
  fromPickerDate,
  isAfterDay,
  localDateOf,
  toPickerDateIso,
  todayLocal,
} from "@/domain/day";

describe("day (ADR-005: local calendar day as YYYY-MM-DD)", () => {
  it("takes today from the device's local calendar, not UTC", () => {
    // 00:30 and 23:30 local: in UTC+7 the first is still "yesterday" in UTC.
    expect(todayLocal(new Date(2026, 10, 16, 0, 30))).toBe("2026-11-16");
    expect(todayLocal(new Date(2026, 10, 16, 23, 30))).toBe("2026-11-16");
    expect(todayLocal(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });

  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-11-16", -1)).toBe("2026-11-15");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("compares days", () => {
    expect(isAfterDay("2026-11-17", "2026-11-16")).toBe(true);
    expect(isAfterDay("2026-11-16", "2026-11-16")).toBe(false);
    expect(isAfterDay("2025-12-31", "2026-01-01")).toBe(false);
  });

  it("gives the local midnight of a day", () => {
    const d = localDateOf("2026-11-16");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([
      2026, 10, 16, 0,
    ]);
    expect(todayLocal(d)).toBe("2026-11-16");
  });

  it("formats as dd/MM/yyyy", () => {
    expect(formatDayVi("2026-11-04")).toBe("04/11/2026");
  });

  it("round-trips through the Compose date picker's UTC-midnight millis", () => {
    // Compose DatePicker selects by UTC day: toISOString() of a local midnight would be the
    // previous day east of UTC, so the picker must get the UTC midnight of the same calendar day.
    expect(toPickerDateIso("2026-11-16")).toBe("2026-11-16T00:00:00.000Z");
    expect(fromPickerDate(new Date(Date.UTC(2026, 10, 16)))).toBe("2026-11-16");
    expect(fromPickerDate(new Date(toPickerDateIso("2028-02-29")))).toBe(
      "2028-02-29",
    );
  });
});
