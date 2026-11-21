import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { AppState } from "react-native";

import {
  DEFAULT_LOG_REMINDER,
  formatReminderTime,
  type LogReminder,
  parseReminderTime,
  type ReminderTime,
} from "@/domain/reminder";
import { useAuth } from "@/features/auth/auth-provider";
import { saveFailureMessage } from "@/features/profile/profile";
import { applyOnDevice, deviceGeneration } from "@/features/reminders/device";
import {
  getPermission,
  requestPermission,
} from "@/features/reminders/scheduler";
import { supabase } from "@/lib/supabase";

export const reminderSettingsKey = (userId: string | undefined) =>
  ["reminder-settings", userId] as const;
const permissionKey = ["notification-permission"] as const;

/** Calls `onActive` whenever the app comes back to the foreground (e.g. from system settings). */
export function useOnAppActive(onActive: () => void) {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") onActive();
    });
    return () => sub.remove();
  }, [onActive]);
}

/** This device's notification permission; read again when the app comes back (§3.6). */
export function useNotificationPermission() {
  const query = useQuery({ queryKey: permissionKey, queryFn: getPermission });
  const { refetch } = query;
  useOnAppActive(useCallback(() => void refetch(), [refetch]));
  return query;
}

type SettingsRow = { log_reminder_enabled: boolean; log_reminder_time: string };

/** The account's log reminder, from user_settings; no row yet means the defaults (§4). */
export function useReminderSettings() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: reminderSettingsKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<LogReminder> => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("log_reminder_enabled, log_reminder_time")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      const row = data as SettingsRow | null;
      if (!row) return DEFAULT_LOG_REMINDER;
      const time = parseReminderTime(row.log_reminder_time);
      if (!time)
        throw new Error("user_settings.log_reminder_time is malformed");
      return { enabled: row.log_reminder_enabled, time };
    },
  });
}

export type SaveOutcome = { ok: true } | { ok: false; message: string };

/** Writes both reminder columns in one upsert (creates the row on the first save). */
export async function saveLogReminder(r: LogReminder): Promise<SaveOutcome> {
  const { error } = await supabase.from("user_settings").upsert(
    {
      log_reminder_enabled: r.enabled,
      log_reminder_time: formatReminderTime(r.time),
    },
    { onConflict: "user_id" },
  );
  return error
    ? { ok: false, message: saveFailureMessage(error) }
    : { ok: true };
}

/**
 * Applies a saved setting to this device without holding up the screen. The saved setting is the
 * result the user sees; the native call can be slow on some Android ROMs (seen on HyperOS), and
 * the next sync (app start or foreground) applies the setting again if this one failed.
 */
function followOnDevice(time: ReminderTime | null, askedIn: number): void {
  applyOnDevice(time, askedIn).catch((e: unknown) => {
    console.warn("Log reminder schedule failed", e);
  });
}

export type TurnOnOutcome =
  { kind: "on" } | { kind: "blocked" } | { kind: "error"; message: string };

/**
 * Switch on (Cài đặt › Nhắc nhở, or "Bật" after Onboarding), Reminders.md §3.1: permission
 * first, then the server, and only a saved setting is scheduled. Nothing changes on a "no" or a
 * failed save (REM-04, REM-11).
 */
export async function turnOnLogReminder(
  time: ReminderTime,
): Promise<TurnOnOutcome> {
  const askedIn = deviceGeneration();
  const current = await getPermission();
  const permission =
    current === "granted" ? current : await requestPermission();
  if (permission !== "granted") return { kind: "blocked" };
  const saved = await saveLogReminder({ enabled: true, time });
  if (!saved.ok) return { kind: "error", message: saved.message };
  followOnDevice(time, askedIn);
  return { kind: "on" };
}

/**
 * Switch off or a new time (§3.2–3.3): the device schedule follows only a saved setting, so a
 * failed save leaves it as it was (REM-11).
 */
export async function updateLogReminder(
  next: LogReminder,
): Promise<SaveOutcome> {
  const askedIn = deviceGeneration();
  const saved = await saveLogReminder(next);
  if (!saved.ok) return saved;
  followOnDevice(next.enabled ? next.time : null, askedIn);
  return saved;
}

/**
 * Brings this device in line with the saved setting (§3.4): on app start and when the app comes
 * back, so a new sign-in, a revoked permission or a new time zone is picked up.
 */
export async function syncLogReminder(
  r: LogReminder,
  stillWanted: () => boolean = () => true,
): Promise<void> {
  const askedIn = deviceGeneration();
  const allowed = r.enabled && (await getPermission()) === "granted";
  // A sync that outlives its screen (e.g. sign-out mid-way) leaves the device to the sign-out.
  if (!stillWanted()) return;
  await applyOnDevice(allowed ? r.time : null, askedIn);
}

/** The two writes, each refreshing the cached setting afterwards (saved or not). */
export function useLogReminderActions() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: reminderSettingsKey(userId) }),
      queryClient.invalidateQueries({ queryKey: permissionKey }),
    ]);
  return {
    turnOn: async (time: ReminderTime) => {
      try {
        return await turnOnLogReminder(time);
      } finally {
        await refresh();
      }
    },
    update: async (next: LogReminder) => {
      try {
        return await updateLogReminder(next);
      } finally {
        await refresh();
      }
    },
  };
}
