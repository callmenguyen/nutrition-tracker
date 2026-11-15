/**
 * Calendar days as "YYYY-MM-DD" in the device's time zone (ADR-005), the same text the
 * `meal_entries.eaten_on` date column takes. Pure; no Intl.
 */
export type Day = string;

const pad = (n: number) => String(n).padStart(2, "0");

function parts(day: Day): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

/** Today on the device's local calendar. */
export function todayLocal(now: Date = new Date()): Day {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Shifts a day by n calendar days (UTC arithmetic, so no DST surprises). */
export function addDays(day: Day, n: number): Day {
  const [y, m, d] = parts(day);
  return fromPickerDate(new Date(Date.UTC(y, m - 1, d + n)));
}

/** True when a is a later day than b ("YYYY-MM-DD" sorts as text). */
export function isAfterDay(a: Day, b: Day): boolean {
  return a > b;
}

/** "2026-11-04" → "04/11/2026" (CLAUDE.md date style). */
export function formatDayVi(day: Day): string {
  const [y, m, d] = parts(day);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/**
 * The Compose DatePicker (@expo/ui) selects by UTC day: pass it the UTC midnight of the
 * calendar day, not a local midnight (which is the previous UTC day east of Greenwich).
 */
export function toPickerDateIso(day: Day): string {
  return `${day}T00:00:00.000Z`;
}

/** Reads the calendar day out of a UTC-midnight Date returned by the Compose DatePicker. */
export function fromPickerDate(date: Date): Day {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
