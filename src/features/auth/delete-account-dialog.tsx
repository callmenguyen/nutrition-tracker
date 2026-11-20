import { useState } from "react";
import { Modal, StyleSheet, View } from "react-native";

import { Button, FormError, TextField } from "@/components/form";
import { ThemedText } from "@/components/themed-text";
import { space } from "@/constants/theme";
import type { DeleteAccountResult } from "@/features/auth/auth";
import { useTheme } from "@/hooks/use-theme";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<DeleteAccountResult>;
};

/**
 * "Xoá tài khoản?" (Account.md §3.4): says that everything goes for good and asks for the password
 * again. Hủy changes nothing (ACC-12); on success the app signs out, which closes this screen.
 */
export function DeleteAccountDialog({ visible, onCancel, onConfirm }: Props) {
  const { colors } = useTheme();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<DeleteAccountResult | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setPassword("");
    setError(null);
    onCancel();
  };

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await onConfirm(password);
      if (!result.ok) setError(result);
    } catch {
      setError({
        ok: false,
        field: "form",
        message: "Không xoá được tài khoản. Thử lại sau.",
      });
    } finally {
      setBusy(false);
    }
  };

  const failure = error && !error.ok ? error : null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={[styles.scrim, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
        <View
          style={[styles.card, { backgroundColor: colors.surfaceContainer }]}
          testID="delete-account-dialog"
          accessibilityViewIsModal
        >
          <ThemedText variant="titleMedium" accessibilityRole="header">
            Xoá tài khoản?
          </ThemedText>
          <ThemedText variant="body">
            Toàn bộ dữ liệu sẽ bị xoá vĩnh viễn: hồ sơ, mục tiêu, các món đã
            ghi, món đã lưu và cài đặt nhắc nhở. Không thể khôi phục.
          </ThemedText>
          <TextField
            label="Nhập mật khẩu để xác nhận"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (failure?.field === "password") setError(null);
            }}
            secureToggle
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            error={failure?.field === "password" ? failure.message : undefined}
            editable={!busy}
            testID="delete-account-password"
          />
          <FormError
            message={failure?.field === "form" ? failure.message : null}
            testID="delete-account-error"
          />
          <View style={styles.actions}>
            <Button
              label="Hủy"
              variant="text"
              onPress={close}
              disabled={busy}
              testID="delete-account-cancel"
            />
            <Button
              label="Xoá vĩnh viễn"
              tone="danger"
              onPress={() => void confirm()}
              disabled={password.length === 0}
              loading={busy}
              testID="delete-account-confirm"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "center", padding: space.l },
  card: { borderRadius: 28, padding: space.l, gap: space.m },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.s,
  },
});
