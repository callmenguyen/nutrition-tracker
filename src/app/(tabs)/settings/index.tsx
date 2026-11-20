import { useRouter } from "expo-router";
import { useState } from "react";

import { Button, FormError } from "@/components/form";
import { FormScreen } from "@/components/form-screen";
import { ListRow } from "@/components/list-row";
import { ThemedText } from "@/components/themed-text";
import { deleteAccount, signOut } from "@/features/auth/auth";
import { useAuth } from "@/features/auth/auth-provider";
import { DeleteAccountDialog } from "@/features/auth/delete-account-dialog";
import { formatInt } from "@/domain/format";
import { formatReminderTime } from "@/domain/reminder";
import { useTargets } from "@/features/goals/goals";
import { useProfile } from "@/features/profile/profile";
import { useReminderSettings } from "@/features/reminders/reminders";

/** Cài đặt (Account.md §2): Hồ sơ, Mục tiêu, Món đã lưu, Nhắc nhở, Tài khoản. */
export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const profile = useProfile();
  const { targets } = useTargets();
  const reminder = useReminderSettings().data;
  const summary = profile.data
    ? `${String(profile.data.weightKg).replace(".", ",")} kg · ${profile.data.heightCm} cm`
    : undefined;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onSignOut = async () => {
    setBusy(true);
    setError(null);
    const result = await signOut();
    setBusy(false);
    // On success the root navigator removes the tabs and shows Đăng nhập (ACC-10).
    if (!result.ok) setError(result.failure.message);
  };

  return (
    <FormScreen title="Cài đặt" testID="screen-settings">
      <ListRow
        label="Hồ sơ"
        supporting={summary}
        onPress={() => router.push("/settings/profile")}
        testID="settings-profile"
      />
      <ListRow
        label="Mục tiêu"
        supporting={
          targets
            ? `${formatInt(targets.calories.target)} kcal mỗi ngày`
            : undefined
        }
        onPress={() => router.push("/settings/goals")}
        testID="settings-goals"
      />
      <ListRow
        label="Món đã lưu"
        onPress={() => router.push("/settings/saved-foods")}
        testID="settings-saved-foods"
      />
      <ListRow
        label="Nhắc nhở"
        supporting={
          reminder
            ? reminder.enabled
              ? `${formatReminderTime(reminder.time)} mỗi ngày`
              : "Tắt"
            : undefined
        }
        onPress={() => router.push("/settings/reminders")}
        testID="settings-reminders"
      />
      <ThemedText variant="titleMedium">Tài khoản</ThemedText>
      <ThemedText
        variant="body"
        color="onSurfaceVariant"
        testID="settings-email"
      >
        {session?.user.email ?? ""}
      </ThemedText>
      <FormError message={error} />
      <Button
        label="Đăng xuất"
        variant="text"
        onPress={onSignOut}
        loading={busy}
        testID="settings-signout"
      />
      <Button
        label="Xoá tài khoản"
        variant="text"
        tone="danger"
        onPress={() => setDeleting(true)}
        testID="settings-delete-account"
      />
      <DeleteAccountDialog
        visible={deleting}
        onCancel={() => setDeleting(false)}
        onConfirm={deleteAccount}
      />
    </FormScreen>
  );
}
