import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";

import type { ReminderTime } from "@/domain/reminder";

/**
 * notificationScheduler (ADR-006): the daily log reminder is scheduled on this device with
 * expo-notifications. Delivery time is best effort; the OS may deliver it late.
 */

/** One fixed id, so scheduling again replaces the reminder instead of adding a second one. */
export const LOG_REMINDER_ID = "log-reminder";
/** Marks the reminder's notifications, so a tap opens Hôm nay (Reminders.md §4). */
export const LOG_REMINDER_KIND = "log-reminder";
const CHANNEL_ID = "log-reminder";

/** Content from Reminders.md §2. */
const CONTENT = {
  title: "Ghi bữa ăn hôm nay",
  body: "Bạn đã ghi những gì mình ăn hôm nay chưa?",
  data: { kind: LOG_REMINDER_KIND },
};

/**
 * granted: notifications allowed. ask: not allowed, but the system can still show its dialog.
 * blocked: the user said no; only the system settings can change it.
 */
export type PermissionState = "granted" | "ask" | "blocked";

/** Shows the reminder even while the app is open; called once from the root layout. */
export function showNotificationsInForeground(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Android shows the permission dialog only after a channel exists (expo-notifications docs). */
async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Nhắc ghi bữa ăn",
    importance: AndroidImportance.DEFAULT,
  });
}

export async function getPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return "granted";
  return p.canAskAgain ? "ask" : "blocked";
}

/** Shows the system dialog when it still can; a "no" counts as blocked (REM-04). */
export async function requestPermission(): Promise<PermissionState> {
  await ensureChannel();
  const p = await Notifications.requestPermissionsAsync();
  return p.granted ? "granted" : "blocked";
}

/**
 * One reminder every day at `time`, device local time. Scheduling the same identifier again
 * replaces the earlier one (expo-notifications stores requests by id), so nothing is cancelled first.
 */
export async function scheduleLogReminder(time: ReminderTime): Promise<void> {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: LOG_REMINDER_ID,
    content: CONTENT,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelLogReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(LOG_REMINDER_ID);
}
