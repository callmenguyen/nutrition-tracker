import { Host, TimePickerDialog } from "@expo/ui/jetpack-compose";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";

import { Button, FormError } from "@/components/form";
import { FormScreen } from "@/components/form-screen";
import { ThemedText } from "@/components/themed-text";
import { layout, space } from "@/constants/theme";
import {
  formatReminderTime,
  fromPickerTime,
  type LogReminder,
  type ReminderTime,
  sameReminderTime,
  snapToStep,
  toPickerTimeIso,
} from "@/domain/reminder";
import type {
  SaveOutcome,
  TurnOnOutcome,
} from "@/features/reminders/reminders";
import type { PermissionState } from "@/features/reminders/scheduler";
import { useTheme } from "@/hooks/use-theme";

export type RemindersState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; saved: LogReminder; permission: PermissionState };

type Props = {
  state: RemindersState;
  onTurnOn: (time: ReminderTime) => Promise<TurnOnOutcome>;
  onUpdate: (next: LogReminder) => Promise<SaveOutcome>;
  onOpenSettings: () => void;
  onRetry: () => void;
  onBack: () => void;
};

const SAVE_FAILED = "Không lưu được. Thử lại sau.";

/**
 * Cài đặt › Nhắc nhở (Reminders.md §2–3): switch, time (5-minute steps) and permission status.
 * While a save runs the new value shows; a failed save puts back the saved one (REM-11).
 */
export function RemindersView({
  state,
  onTurnOn,
  onUpdate,
  onOpenSettings,
  onRetry,
  onBack,
}: Props) {
  const { colors } = useTheme();
  const [pending, setPending] = useState<LogReminder | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Android cannot tell "never asked" from "said no once", so a "no" here is remembered.
  const [denied, setDenied] = useState(false);
  const [picking, setPicking] = useState(false);

  const run = async (
    next: LogReminder,
    write: () => Promise<{ ok: boolean; message?: string }>,
  ) => {
    setError(null);
    setPending(next);
    try {
      const result = await write();
      if (!result.ok) setError(result.message ?? SAVE_FAILED);
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setPending(null);
    }
  };

  const content = () => {
    if (state.status === "loading") {
      return (
        <ThemedText
          variant="body"
          color="onSurfaceVariant"
          accessibilityState={{ busy: true }}
          testID="reminders-loading"
        >
          Đang tải…
        </ThemedText>
      );
    }
    if (state.status === "error") {
      return (
        <View>
          <ThemedText variant="body" testID="reminders-error">
            Không tải được cài đặt nhắc nhở.
          </ThemedText>
          <View style={styles.start}>
            <Button
              label="Thử lại"
              variant="text"
              onPress={onRetry}
              testID="reminders-retry"
            />
          </View>
        </View>
      );
    }

    const { saved, permission } = state;
    const shown = pending ?? saved;
    const busy = pending !== null;
    const blocked =
      permission !== "granted" && (permission === "blocked" || denied);

    const toggle = (on: boolean) => {
      if (busy) return;
      if (!on) {
        void run({ ...saved, enabled: false }, () =>
          onUpdate({ ...saved, enabled: false }),
        );
        return;
      }
      void run({ ...saved, enabled: true }, async () => {
        const outcome = await onTurnOn(saved.time);
        if (outcome.kind === "blocked") {
          setDenied(true);
          return { ok: true };
        }
        if (outcome.kind === "error")
          return { ok: false, message: outcome.message };
        setDenied(false);
        return { ok: true };
      });
    };

    const pickTime = (picked: ReminderTime) => {
      const time = snapToStep(picked);
      if (sameReminderTime(time, saved.time)) return;
      void run({ ...saved, time }, () => onUpdate({ ...saved, time }));
    };

    return (
      <>
        <View style={styles.row}>
          <ThemedText variant="body" style={styles.grow}>
            Nhắc ghi bữa ăn
          </ThemedText>
          <Switch
            value={shown.enabled}
            onValueChange={toggle}
            disabled={busy}
            accessibilityLabel="Nhắc ghi bữa ăn"
            trackColor={{ true: colors.primary }}
            testID="reminder-switch"
          />
        </View>
        <Pressable
          onPress={() => setPicking(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Giờ nhắc, ${formatReminderTime(shown.time)}`}
          accessibilityHint="Chọn giờ nhắc"
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: colors.surfaceContainer },
          ]}
          testID="reminder-time"
        >
          <ThemedText variant="body" style={styles.grow}>
            Giờ nhắc
          </ThemedText>
          <ThemedText variant="body" numeric testID="reminder-time-value">
            {formatReminderTime(shown.time)}
          </ThemedText>
        </Pressable>
        <ThemedText variant="bodySmall" color="onSurfaceVariant">
          Mỗi ngày một lần, theo giờ của máy. Giờ nhắc theo bước 5 phút: giờ lẻ
          được làm tròn lên (14:07 thành 14:10). Điện thoại có thể gửi trễ vài
          phút.
        </ThemedText>
        {permission === "granted" ? (
          <ThemedText
            variant="bodySmall"
            color="onSurfaceVariant"
            testID="reminder-permission-granted"
          >
            Thông báo: Đã cho phép
          </ThemedText>
        ) : blocked ? (
          <View style={styles.blocked}>
            <ThemedText
              variant="bodySmall"
              color="error"
              testID="reminder-permission-blocked"
            >
              Thông báo: Bị chặn trong cài đặt hệ thống
            </ThemedText>
            <View style={styles.start}>
              <Button
                label="Mở cài đặt"
                variant="text"
                onPress={onOpenSettings}
                testID="reminder-open-settings"
              />
            </View>
          </View>
        ) : null}
        <FormError message={error} testID="reminder-error" />
        {picking ? (
          <Host matchContents>
            <TimePickerDialog
              initialDate={toPickerTimeIso(saved.time)}
              is24Hour
              confirmButtonLabel="Chọn"
              dismissButtonLabel="Hủy"
              color={colors.primary}
              onDateSelected={(date) => {
                setPicking(false);
                pickTime(fromPickerTime(date));
              }}
              onDismissRequest={() => setPicking(false)}
            />
          </Host>
        ) : null}
      </>
    );
  };

  return (
    <FormScreen
      title="Nhắc nhở"
      subtitle="Nhắc bạn ghi bữa ăn mỗi ngày."
      testID="screen-settings-reminders"
      onBack={onBack}
    >
      {content()}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
  },
  grow: { flex: 1 },
  blocked: { gap: space.xs },
  start: { alignSelf: "flex-start" },
});
