import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { todayLocal } from "@/domain/day";
import {
  syncLogReminder,
  useOnAppActive,
  useReminderSettings,
} from "@/features/reminders/reminders";
import { LOG_REMINDER_KIND } from "@/features/reminders/scheduler";

/**
 * Keeps this device's schedule in line with the saved setting while signed in (Reminders.md
 * §3.4–3.6): after sign-in, on app start and whenever the app comes back to the foreground.
 * Sign-out cancels it in AuthProvider.
 */
export function useReminderSync() {
  const saved = useReminderSettings().data;
  const [activeCount, setActiveCount] = useState(0);
  useOnAppActive(useCallback(() => setActiveCount((n) => n + 1), []));
  useEffect(() => {
    if (!saved) return;
    syncLogReminder(saved).catch((e: unknown) => {
      // Nothing to show: the next app start or foreground tries again.
      console.warn("Log reminder sync failed", e);
    });
  }, [saved, activeCount]);
}

/** A tap on the reminder opens Hôm nay at today, also from a cold start (REM-03). */
export function useOpenTodayFromReminder() {
  const response = Notifications.useLastNotificationResponse();
  const router = useRouter();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (
      !response ||
      response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
    )
      return;
    const { request, date } = response.notification;
    if (request.content.data?.kind !== LOG_REMINDER_KIND) return;
    const key = `${request.identifier}@${date}`;
    if (handled.current === key) return;
    handled.current = key;
    Notifications.clearLastNotificationResponse();
    router.navigate({
      pathname: "/",
      params: { day: todayLocal(), at: String(Date.now()) },
    });
  }, [response, router]);
}
