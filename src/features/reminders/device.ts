import { formatReminderTime, type ReminderTime } from "@/domain/reminder";
import {
  cancelLogReminder,
  scheduleLogReminder,
} from "@/features/reminders/scheduler";

/**
 * This device's log reminder, applied one change at a time and only when it changes.
 *
 * Every expo-notifications call on Android is a broadcast to the app's own receiver; on the
 * HyperOS test phone those waited minutes in the system queue (#20). So repeated syncs (each app
 * foreground) must not pile up calls, and calls must not overtake each other (a sign-out cancel
 * after a pending schedule must win). What was applied is kept in memory only: a cold start
 * applies the setting again, which also restores a schedule the OS dropped (e.g. force stop).
 */
let applied: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Schedules the daily reminder at `time` (local time), or removes it for null. */
export function applyOnDevice(time: ReminderTime | null): Promise<void> {
  const run = async () => {
    // The time zone is part of the key: after a move, the next sync schedules again (§4).
    const key = time ? `${formatReminderTime(time)}@${timeZone()}` : "off";
    if (applied === key) return;
    if (time) await scheduleLogReminder(time);
    else await cancelLogReminder();
    applied = key;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
