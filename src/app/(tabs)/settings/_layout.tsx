import { Stack } from "expo-router";

/** Cài đặt is a stack inside its tab: index → Hồ sơ, Mục tiêu, Món đã lưu, Nhắc nhở. */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
