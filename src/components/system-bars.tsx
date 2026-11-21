import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/hooks/use-theme";

/**
 * Status bar icons that stay readable on the page (#54): dark on the light paper, light on the
 * dark one. Follows the same scheme as the palette. A `Modal` (meal sheet, dialogs) copies this
 * style from the activity when it opens, so it needs nothing of its own.
 */
export function SystemBars() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}
