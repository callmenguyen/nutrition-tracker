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
type Device = typeof import("@/features/reminders/device");
let applyOnDevice: Device["applyOnDevice"];
let stopOnDevice: Device["stopOnDevice"];
let deviceGeneration: Device["deviceGeneration"];

beforeEach(() => {
  jest.clearAllMocks();
  mockSchedule.mockResolvedValue();
  mockCancel.mockResolvedValue();
  jest.isolateModules(() => {
    ({ applyOnDevice, stopOnDevice, deviceGeneration } =
      jest.requireActual<Device>("@/features/reminders/device"));
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

  it("REM-08: a schedule asked for before sign-out is dropped", async () => {
    const askedIn = deviceGeneration();
    await stopOnDevice();
    await applyOnDevice(at2000, askedIn);
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalledTimes(1);
    // After signing in again, new requests apply.
    await applyOnDevice(at2000, deviceGeneration());
    expect(mockSchedule).toHaveBeenCalledWith(at2000);
  });

  it("a native call that never answers times out and the queue moves on", async () => {
    jest.useFakeTimers();
    try {
      mockSchedule.mockReturnValueOnce(new Promise<void>(() => {}));
      const hung = applyOnDevice(at2000);
      const next = applyOnDevice(null);
      await jest.advanceTimersByTimeAsync(30_000);
      await expect(hung).rejects.toThrow("timed out");
      await next;
      expect(mockCancel).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a failure does not leave the old key: the old time is applied again", async () => {
    await applyOnDevice(at2000);
    mockSchedule.mockRejectedValueOnce(new Error("reply lost"));
    await expect(applyOnDevice(at2100)).rejects.toThrow("reply lost");
    await applyOnDevice(at2000);
    expect(mockSchedule.mock.calls).toEqual([[at2000], [at2100], [at2000]]);
  });
});
