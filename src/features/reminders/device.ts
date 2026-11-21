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
 * foreground) must not pile up calls, and calls must not overtake each other. What was applied is
 * kept in memory only: a cold start applies the setting again, which also restores a schedule the
 * OS dropped (e.g. force stop).
 */
let applied: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
/** Bumped by sign-out; a schedule requested before it is dropped (REM-08). */
let generation = 0;

/** A native call that never answers must not block later ones (the queue moves on). */
const NATIVE_TIMEOUT_MS = 30_000;

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function withTimeout(task: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("notification call timed out")),
      NATIVE_TIMEOUT_MS,
    );
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

/** The current sign-in generation; pass it to applyOnDevice from flows that can outlive it. */
export function deviceGeneration(): number {
  return generation;
}

/**
 * Schedules the daily reminder at `time` (local time), or removes it for null. A schedule asked
 * for under an older generation (the user signed out since) does nothing.
 */
export function applyOnDevice(
  time: ReminderTime | null,
  askedIn: number = generation,
): Promise<void> {
  const run = async () => {
    if (time && askedIn !== generation) return;
    // The time zone is part of the key: after a move, the next sync schedules again (§4).
    const key = time ? `${formatReminderTime(time)}@${timeZone()}` : "off";
    if (applied === key) return;
    // Unknown until the call answers: a failure must not leave a stale key that skips a retry.
    applied = null;
    await withTimeout(time ? scheduleLogReminder(time) : cancelLogReminder());
    applied = key;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Sign-out: drops schedules still on their way and removes the reminder from this device. */
export function stopOnDevice(): Promise<void> {
  generation += 1;
  return applyOnDevice(null);
}
