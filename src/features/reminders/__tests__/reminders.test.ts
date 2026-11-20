import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  syncLogReminder,
  turnOnLogReminder,
  updateLogReminder,
} from "@/features/reminders/reminders";
import type { PermissionState } from "@/features/reminders/scheduler";

const mockUpsert =
  jest.fn<
    (
      row: unknown,
      opts: unknown,
    ) => Promise<{ error: { message: string } | null }>
  >();
const mockGetPermission = jest.fn<() => Promise<PermissionState>>();
const mockRequestPermission = jest.fn<() => Promise<PermissionState>>();
const mockSchedule = jest.fn<(t: unknown) => Promise<void>>();
const mockCancel = jest.fn<() => Promise<void>>();

jest.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ upsert: mockUpsert }) },
}));
jest.mock("@/features/reminders/scheduler", () => ({
  getPermission: () => mockGetPermission(),
  requestPermission: () => mockRequestPermission(),
  scheduleLogReminder: (t: unknown) => mockSchedule(t),
  cancelLogReminder: () => mockCancel(),
}));

const at2100 = { hour: 21, minute: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null });
  mockSchedule.mockResolvedValue();
  mockCancel.mockResolvedValue();
});

describe("turnOnLogReminder (Reminders.md §3.1)", () => {
  it("asks, saves, then schedules", async () => {
    mockGetPermission.mockResolvedValue("ask");
    mockRequestPermission.mockResolvedValue("granted");
    expect(await turnOnLogReminder(at2100)).toEqual({ kind: "on" });
    expect(mockUpsert).toHaveBeenCalledWith(
      { log_reminder_enabled: true, log_reminder_time: "21:00" },
      { onConflict: "user_id" },
    );
    expect(mockSchedule).toHaveBeenCalledWith(at2100);
  });

  it("does not ask again when already allowed", async () => {
    mockGetPermission.mockResolvedValue("granted");
    await turnOnLogReminder(at2100);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("REM-04: a 'no' saves nothing and schedules nothing", async () => {
    mockGetPermission.mockResolvedValue("ask");
    mockRequestPermission.mockResolvedValue("blocked");
    expect(await turnOnLogReminder(at2100)).toEqual({ kind: "blocked" });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("REM-11: a failed save leaves the device schedule alone", async () => {
    mockGetPermission.mockResolvedValue("granted");
    mockUpsert.mockResolvedValue({
      error: { message: "Network request failed" },
    });
    expect(await turnOnLogReminder(at2100)).toEqual({
      kind: "error",
      message: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    });
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe("updateLogReminder (§3.2–3.3)", () => {
  it("a new time reschedules when on", async () => {
    expect(await updateLogReminder({ enabled: true, time: at2100 })).toEqual({
      ok: true,
    });
    expect(mockSchedule).toHaveBeenCalledWith(at2100);
  });

  it("switching off cancels", async () => {
    await updateLogReminder({ enabled: false, time: at2100 });
    expect(mockUpsert).toHaveBeenCalledWith(
      { log_reminder_enabled: false, log_reminder_time: "21:00" },
      { onConflict: "user_id" },
    );
    expect(mockCancel).toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("REM-11: a failed save changes nothing on the device", async () => {
    mockUpsert.mockResolvedValue({ error: { message: "fetch failed" } });
    const r = await updateLogReminder({ enabled: false, time: at2100 });
    expect(r.ok).toBe(false);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe("a scheduler that never answers (seen on HyperOS)", () => {
  it("does not hold up switching on or changing the time", async () => {
    mockGetPermission.mockResolvedValue("granted");
    mockSchedule.mockReturnValue(new Promise<void>(() => {}));
    expect(await turnOnLogReminder(at2100)).toEqual({ kind: "on" });
    expect(await updateLogReminder({ enabled: true, time: at2100 })).toEqual({
      ok: true,
    });
  });

  it("a failed schedule is logged, the saved setting still stands", async () => {
    mockGetPermission.mockResolvedValue("granted");
    mockSchedule.mockRejectedValue(new Error("Failed to schedule"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(await turnOnLogReminder(at2100)).toEqual({ kind: "on" });
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("syncLogReminder (§3.4–3.6)", () => {
  it("schedules a saved, allowed reminder", async () => {
    mockGetPermission.mockResolvedValue("granted");
    await syncLogReminder({ enabled: true, time: at2100 });
    expect(mockSchedule).toHaveBeenCalledWith(at2100);
  });

  it("cancels when off or when the permission was revoked", async () => {
    mockGetPermission.mockResolvedValue("granted");
    await syncLogReminder({ enabled: false, time: at2100 });
    mockGetPermission.mockResolvedValue("blocked");
    await syncLogReminder({ enabled: true, time: at2100 });
    expect(mockCancel).toHaveBeenCalledTimes(2);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
