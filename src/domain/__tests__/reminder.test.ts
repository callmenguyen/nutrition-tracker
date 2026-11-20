import { describe, expect, it } from "@jest/globals";

import {
  DEFAULT_LOG_REMINDER,
  formatReminderTime,
  fromPickerTime,
  parseReminderTime,
  sameReminderTime,
  snapToStep,
  toPickerTimeIso,
} from "@/domain/reminder";

describe("parseReminderTime", () => {
  it("reads Postgres time text and the short form", () => {
    expect(parseReminderTime("20:00:00")).toEqual({ hour: 20, minute: 0 });
    expect(parseReminderTime("07:35")).toEqual({ hour: 7, minute: 35 });
    expect(parseReminderTime("23:55:00")).toEqual({ hour: 23, minute: 55 });
  });

  it("rejects anything that is not a wall-clock time", () => {
    for (const bad of ["", "7:35", "24:00", "12:60", "20-00", "20:00:00Z"]) {
      expect(parseReminderTime(bad)).toBeNull();
    }
  });
});

describe("formatReminderTime", () => {
  it("is HH:mm with leading zeros", () => {
    expect(formatReminderTime({ hour: 7, minute: 5 })).toBe("07:05");
    expect(formatReminderTime({ hour: 21, minute: 0 })).toBe("21:00");
  });

  it("round-trips through parse", () => {
    const t = { hour: 6, minute: 45 };
    expect(parseReminderTime(formatReminderTime(t))).toEqual(t);
  });
});

describe("snapToStep", () => {
  it("rounds minutes up to a multiple of 5, never before the picked time", () => {
    expect(snapToStep({ hour: 21, minute: 7 })).toEqual({
      hour: 21,
      minute: 10,
    });
    expect(snapToStep({ hour: 21, minute: 1 })).toEqual({
      hour: 21,
      minute: 5,
    });
    expect(snapToStep({ hour: 21, minute: 10 })).toEqual({
      hour: 21,
      minute: 10,
    });
  });

  it("carries into the next hour, and past midnight to 00:00", () => {
    expect(snapToStep({ hour: 21, minute: 58 })).toEqual({
      hour: 22,
      minute: 0,
    });
    expect(snapToStep({ hour: 23, minute: 59 })).toEqual({
      hour: 0,
      minute: 0,
    });
  });
});

describe("defaults (Reminders.md §4)", () => {
  it("is off at 20:00", () => {
    expect(DEFAULT_LOG_REMINDER.enabled).toBe(false);
    expect(
      sameReminderTime(DEFAULT_LOG_REMINDER.time, { hour: 20, minute: 0 }),
    ).toBe(true);
  });
});

describe("time picker round trip", () => {
  it("keeps the local wall-clock time", () => {
    const iso = toPickerTimeIso(
      { hour: 21, minute: 35 },
      new Date(2026, 10, 21, 9, 0),
    );
    expect(fromPickerTime(new Date(iso))).toEqual({ hour: 21, minute: 35 });
  });
});
