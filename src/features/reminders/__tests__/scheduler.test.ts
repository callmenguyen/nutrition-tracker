import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Notifications from "expo-notifications";

import {
  getPermission,
  LOG_REMINDER_ID,
  requestPermission,
  scheduleLogReminder,
} from "@/features/reminders/scheduler";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => "log-reminder"),
}));

const N = jest.mocked(Notifications);
const perm = (granted: boolean, canAskAgain: boolean) =>
  ({ granted, canAskAgain }) as Awaited<
    ReturnType<typeof Notifications.getPermissionsAsync>
  >;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("permission", () => {
  it("maps the system state", async () => {
    N.getPermissionsAsync.mockResolvedValueOnce(perm(true, true));
    expect(await getPermission()).toBe("granted");
    N.getPermissionsAsync.mockResolvedValueOnce(perm(false, true));
    expect(await getPermission()).toBe("ask");
    N.getPermissionsAsync.mockResolvedValueOnce(perm(false, false));
    expect(await getPermission()).toBe("blocked");
  });

  it("creates the channel before the dialog (Android 13)", async () => {
    N.requestPermissionsAsync.mockResolvedValueOnce(perm(false, true));
    expect(await requestPermission()).toBe("blocked");
    expect(
      N.setNotificationChannelAsync.mock.invocationCallOrder[0],
    ).toBeLessThan(N.requestPermissionsAsync.mock.invocationCallOrder[0]);
  });
});

describe("scheduleLogReminder", () => {
  it("replaces the one daily reminder at the saved local time", async () => {
    await scheduleLogReminder({ hour: 21, minute: 5 });
    // Same id replaces the earlier one; no cancel round trip first.
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: LOG_REMINDER_ID,
      content: {
        title: "Ghi bữa ăn hôm nay",
        body: "Bạn đã ghi những gì mình ăn hôm nay chưa?",
        data: { kind: "log-reminder" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 21,
        minute: 5,
        channelId: "log-reminder",
      },
    });
  });
});
