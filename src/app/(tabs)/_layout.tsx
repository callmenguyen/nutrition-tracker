import AppTabs from "@/components/app-tabs";
import {
  useOpenTodayFromReminder,
  useReminderSync,
} from "@/features/reminders/reminder-sync";

/** Mounted only while signed in with a profile, which is when reminders apply. */
export default function TabsLayout() {
  useReminderSync();
  useOpenTodayFromReminder();
  return <AppTabs />;
}
