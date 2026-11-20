import { useRouter } from "expo-router";
import { Linking } from "react-native";

import {
  useLogReminderActions,
  useNotificationPermission,
  useReminderSettings,
} from "@/features/reminders/reminders";
import {
  RemindersView,
  type RemindersState,
} from "@/features/reminders/reminders-view";

/** Cài đặt › Nhắc nhở (Reminders.md §2; REM-04, REM-07, REM-11). */
export default function RemindersScreen() {
  const router = useRouter();
  const settings = useReminderSettings();
  const permission = useNotificationPermission();
  const actions = useLogReminderActions();
  const state: RemindersState =
    settings.data && permission.data
      ? {
          status: "ready",
          saved: settings.data,
          permission: permission.data,
        }
      : settings.isError || permission.isError
        ? { status: "error" }
        : { status: "loading" };

  return (
    <RemindersView
      state={state}
      onTurnOn={actions.turnOn}
      onUpdate={actions.update}
      onOpenSettings={() => void Linking.openSettings()}
      onRetry={() => {
        void settings.refetch();
        void permission.refetch();
      }}
      onBack={() => router.back()}
    />
  );
}
