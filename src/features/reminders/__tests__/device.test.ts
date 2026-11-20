import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { ReminderTime } from "@/domain/reminder";

const mockSchedule = jest.fn<(t: ReminderTime) => Promise<void>>();
const mockCancel = jest.fn<() => Promise<void>>();

jest.mock("@/features/reminders/scheduler", () => ({
  scheduleLogReminder: (t: ReminderTime) => mockSchedule(t),
  cancelLogReminder: () => mockCancel(),
}));

const at2000 = { hour: 20, minute: 0 };
const at2100 = { hour: 21, minute: 0 };

/** A fresh module per test: what was applied lives in module memory. */
let applyOnDevice: (t: ReminderTime | null) => Promise<void>;

beforeEach(() => {
  jest.clearAllMocks();
  mockSchedule.mockResolvedValue();
  mockCancel.mockResolvedValue();
  jest.isolateModules(() => {
    ({ applyOnDevice } = jest.requireActual<
      typeof import("@/features/reminders/device")
    >("@/features/reminders/device"));
  });
});

describe("applyOnDevice", () => {
  it("applies once; the same setting again does nothing (each foreground syncs)", async () => {
    await applyOnDevice(at2000);
    await applyOnDevice(at2000);
    await applyOnDevice(at2000);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("a new time or switching off is applied", async () => {
    await applyOnDevice(at2000);
    await applyOnDevice(at2100);
    await applyOnDevice(null);
    await applyOnDevice(null);
    expect(mockSchedule.mock.calls).toEqual([[at2000], [at2100]]);
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it("runs calls in order: a sign-out cancel waits for a slow schedule and wins", async () => {
    let finishSchedule = () => {};
    mockSchedule.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSchedule = resolve;
      }),
    );
    const order: string[] = [];
    mockCancel.mockImplementation(async () => {
      order.push("cancel");
    });
    const scheduled = applyOnDevice(at2000).then(() => order.push("schedule"));
    const cancelled = applyOnDevice(null);
    await Promise.resolve();
    expect(mockCancel).not.toHaveBeenCalled();
    finishSchedule();
    await Promise.all([scheduled, cancelled]);
    expect(order).toEqual(["schedule", "cancel"]);
  });

  it("a failed call is tried again next time", async () => {
    mockSchedule.mockRejectedValueOnce(new Error("broadcast failed"));
    await expect(applyOnDevice(at2000)).rejects.toThrow("broadcast failed");
    await applyOnDevice(at2000);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });

  it("a new time zone schedules the same time again", async () => {
    await applyOnDevice(at2000);
    const spy = jest
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({
        timeZone: "Asia/Tokyo",
      } as Intl.ResolvedDateTimeFormatOptions);
    await applyOnDevice(at2000);
    spy.mockRestore();
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });
});
