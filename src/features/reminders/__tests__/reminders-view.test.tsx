import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { LogReminder, ReminderTime } from "@/domain/reminder";
import type {
  SaveOutcome,
  TurnOnOutcome,
} from "@/features/reminders/reminders";
import {
  RemindersView,
  type RemindersState,
} from "@/features/reminders/reminders-view";

jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaView: View };
});
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
// The Compose dialog is native; expose its props through a stand-in view.
jest.mock("@expo/ui/jetpack-compose", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Host: ({ children }: { children: unknown }) => children,
    TimePickerDialog: (p: object) => <View testID="time-picker" {...p} />,
  };
});
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

const OFF: LogReminder = { enabled: false, time: { hour: 20, minute: 0 } };
const ON: LogReminder = { enabled: true, time: { hour: 20, minute: 0 } };
const ready = (
  saved: LogReminder,
  permission: "granted" | "ask" | "blocked" = "ask",
): RemindersState => ({ status: "ready", saved, permission });

const onTurnOn = jest.fn<(t: ReminderTime) => Promise<TurnOnOutcome>>();
const onUpdate = jest.fn<(r: LogReminder) => Promise<SaveOutcome>>();
const onOpenSettings = jest.fn();

const show = (state: RemindersState) =>
  render(
    <RemindersView
      state={state}
      onTurnOn={onTurnOn}
      onUpdate={onUpdate}
      onOpenSettings={onOpenSettings}
      onRetry={() => {}}
      onBack={() => {}}
    />,
  );
const switchValue = () => screen.getByTestId("reminder-switch").props.value;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RemindersView", () => {
  it("shows the saved setting; no permission line before asking", async () => {
    await show(ready(OFF));
    expect(switchValue()).toBe(false);
    expect(screen.getByTestId("reminder-time-value").props.children).toBe(
      "20:00",
    );
    expect(screen.queryByTestId("reminder-permission-blocked")).toBeNull();
    expect(screen.queryByTestId("reminder-permission-granted")).toBeNull();
  });

  it("switching on calls turnOn with the saved time", async () => {
    onTurnOn.mockResolvedValue({ kind: "on" });
    await show(ready(OFF, "granted"));
    await fireEvent(screen.getByTestId("reminder-switch"), "valueChange", true);
    expect(onTurnOn).toHaveBeenCalledWith({ hour: 20, minute: 0 });
    expect(screen.getByTestId("reminder-permission-granted")).toBeTruthy();
  });

  it("REM-04: a 'no' leaves the switch off and shows Bị chặn + Mở cài đặt", async () => {
    onTurnOn.mockResolvedValue({ kind: "blocked" });
    await show(ready(OFF, "ask"));
    await fireEvent(screen.getByTestId("reminder-switch"), "valueChange", true);
    expect(switchValue()).toBe(false);
    expect(
      screen.getByTestId("reminder-permission-blocked").props.children,
    ).toBe("Thông báo: Bị chặn trong cài đặt hệ thống");
    await fireEvent.press(screen.getByTestId("reminder-open-settings"));
    expect(onOpenSettings).toHaveBeenCalled();
    expect(screen.queryByTestId("reminder-error")).toBeNull();
  });

  it("shows Bị chặn when the system no longer asks", async () => {
    await show(ready(OFF, "blocked"));
    expect(screen.getByTestId("reminder-permission-blocked")).toBeTruthy();
  });

  it("REM-11: a failed save shows the error and puts the saved values back", async () => {
    onUpdate.mockResolvedValue({
      ok: false,
      message: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    });
    await show(ready(ON, "granted"));
    await fireEvent(
      screen.getByTestId("reminder-switch"),
      "valueChange",
      false,
    );
    expect(onUpdate).toHaveBeenCalledWith({ ...ON, enabled: false });
    expect(switchValue()).toBe(true);
    expect(screen.getByTestId("reminder-error").props.children).toBe(
      "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    );
  });

  it("a picked time is rounded up to 5 minutes and saved", async () => {
    onUpdate.mockResolvedValue({ ok: true });
    await show(ready(ON, "granted"));
    await fireEvent.press(screen.getByTestId("reminder-time"));
    const picker = screen.getByTestId("time-picker");
    expect(picker.props.is24Hour).toBe(true);
    await fireEvent(picker, "dateSelected", new Date(2026, 10, 21, 21, 7));
    expect(onUpdate).toHaveBeenCalledWith({
      enabled: true,
      time: { hour: 21, minute: 10 },
    });
    expect(screen.queryByTestId("time-picker")).toBeNull();
  });

  it("picking the same time saves nothing", async () => {
    await show(ready(ON, "granted"));
    await fireEvent.press(screen.getByTestId("reminder-time"));
    await fireEvent(
      screen.getByTestId("time-picker"),
      "dateSelected",
      new Date(2026, 10, 21, 19, 57),
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("load error offers Thử lại", async () => {
    await show({ status: "error" });
    expect(screen.getByTestId("reminders-retry")).toBeTruthy();
  });
});
