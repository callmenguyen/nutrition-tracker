/** Local wall-clock time of the daily log reminder (Reminders.md §5: `log_reminder_time`). */
export type ReminderTime = { hour: number; minute: number };

export type LogReminder = { enabled: boolean; time: ReminderTime };

/** Minutes are a multiple of this step (Reminders.md §2; enforced by the user_settings check). */
export const REMINDER_STEP_MIN = 5;

/**
 * Business rule for an account without a user_settings row yet (Reminders.md §4: off, 20:00).
 * It mirrors the column defaults of user_settings; the first save writes a real row.
 */
export const DEFAULT_LOG_REMINDER: LogReminder = {
  enabled: false,
  time: { hour: 20, minute: 0 },
};

/** Postgres `time` text ("20:00:00") or the short form ("20:00"); null when it is anything else. */
export function parseReminderTime(text: string): ReminderTime | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** "HH:mm", 24-hour (CLAUDE.md time style); also the value written to user_settings. */
export function formatReminderTime(t: ReminderTime): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(t.hour)}:${pad(t.minute)}`;
}

/**
 * A picked time rounded down to the 5-minute step: 21:07 → 21:05. Rounding down never moves the
 * reminder into the next hour (or the next day at 23:58).
 */
export function snapToStep(t: ReminderTime): ReminderTime {
  return {
    hour: t.hour,
    minute: t.minute - (t.minute % REMINDER_STEP_MIN),
  };
}

export function sameReminderTime(a: ReminderTime, b: ReminderTime): boolean {
  return a.hour === b.hour && a.minute === b.minute;
}

/** ISO instant for the Material time picker: today at `t`, device local time (@expo/ui reads local). */
export function toPickerTimeIso(
  t: ReminderTime,
  now: Date = new Date(),
): string {
  const d = new Date(now);
  d.setHours(t.hour, t.minute, 0, 0);
  return d.toISOString();
}

/** The local wall-clock time of a picker result. */
export function fromPickerTime(date: Date): ReminderTime {
  return { hour: date.getHours(), minute: date.getMinutes() };
}
