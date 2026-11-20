import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, BackHandler } from "react-native";

import { Button, FormError } from "@/components/form";
import { FormScreen } from "@/components/form-screen";
import { computeTargets, type Profile } from "@/domain/nutrition";
import { DEFAULT_LOG_REMINDER, formatReminderTime } from "@/domain/reminder";
import { signOut } from "@/features/auth/auth";
import { TargetsSummary } from "@/features/goals/targets-summary";
import {
  EMPTY_PROFILE_FORM,
  toFormValues,
  useSaveProfile,
} from "@/features/profile/profile";
import { ProfileForm } from "@/features/profile/profile-form";
import { useLogReminderActions } from "@/features/reminders/reminders";

/**
 * Account.md §2: profile form → "Tiếp tục" → summary of BMI, BMR and suggested goals → "Bắt đầu".
 * Only "Bắt đầu" saves, so the root guards move on to the tabs after the user saw the summary.
 */
export default function OnboardingScreen() {
  const save = useSaveProfile();
  const reminder = useLogReminderActions();
  // The last profile typed; kept when going back from the summary so nothing is retyped.
  const [draft, setDraft] = useState<Profile | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back on the summary returns to the form; on the form it asks to leave the app (§3.5).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (showSummary) {
          setShowSummary(false);
          return true;
        }
        Alert.alert("Thoát app?", "Hồ sơ chưa được lưu.", [
          { text: "Ở lại", style: "cancel" },
          {
            text: "Thoát",
            style: "destructive",
            onPress: () => BackHandler.exitApp(),
          },
        ]);
        return true;
      });
      return () => sub.remove();
    }, [showSummary]),
  );

  if (draft && showSummary) {
    // A new account has no custom goals yet and Workout is off (GOAL-02).
    const targets = computeTargets(
      draft,
      {},
      { currentYear: new Date().getFullYear(), workoutEnabled: false },
    );
    const start = async () => {
      setError(null);
      try {
        const result = await save.mutateAsync(draft);
        if (!result.ok) {
          setError(result.failure.message); // stay here, keep the draft (ACC-14)
          return;
        }
        // The guards move on to Hôm nay; the native dialog stays on top (Reminders.md §2).
        offerReminder(reminder.turnOn);
      } catch {
        setError("Không lưu được. Thử lại sau.");
      }
    };
    return (
      <FormScreen
        title="Mục tiêu gợi ý"
        subtitle="Tính từ hồ sơ của bạn. Bạn sửa được trong Cài đặt › Mục tiêu."
        testID="screen-onboarding-summary"
        onBack={() => setShowSummary(false)}
      >
        <TargetsSummary targets={targets} workoutEnabled={false} />
        <FormError message={error} testID="onboarding-error" />
        <Button
          label="Bắt đầu"
          onPress={() => void start()}
          loading={save.isPending}
          testID="onboarding-start"
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen
      title="Hồ sơ của bạn"
      subtitle="Dùng để tính mục tiêu calo và dinh dưỡng mỗi ngày. Bạn sửa được trong Cài đặt."
      testID="screen-onboarding"
    >
      <ProfileForm
        initialValues={draft ? toFormValues(draft) : EMPTY_PROFILE_FORM}
        submitLabel="Tiếp tục"
        onSubmit={async (p) => {
          setDraft(p);
          setShowSummary(true);
          return { ok: true };
        }}
      />
      <Button
        label="Đăng xuất"
        variant="text"
        onPress={() => void signOut()}
        testID="onboarding-signout"
      />
    </FormScreen>
  );
}

/**
 * "Nhắc bạn ghi bữa ăn lúc 20:00 mỗi ngày?" after Onboarding. "Để sau" keeps reminders off and
 * never asks for permission (REM-01); "Bật" asks, saves and schedules like the Settings switch.
 */
function offerReminder(
  turnOn: ReturnType<typeof useLogReminderActions>["turnOn"],
) {
  const { time } = DEFAULT_LOG_REMINDER;
  const failed = () =>
    Alert.alert(
      "Không lưu được nhắc nhở",
      "Bạn bật lại trong Cài đặt › Nhắc nhở.",
    );
  Alert.alert(
    "Nhắc ghi bữa ăn",
    `Nhắc bạn ghi bữa ăn lúc ${formatReminderTime(time)} mỗi ngày?`,
    [
      { text: "Để sau", style: "cancel" },
      {
        text: "Bật",
        onPress: () => {
          turnOn(time)
            .then((outcome) => {
              if (outcome.kind === "error") failed();
            })
            .catch(failed);
        },
      },
    ],
    { cancelable: false },
  );
}
