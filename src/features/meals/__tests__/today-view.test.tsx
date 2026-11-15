import { describe, expect, it, jest } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";

import { formatInt } from "@/domain/format";
import { computeTargets, type Profile } from "@/domain/nutrition";
import type { MealEntry } from "@/features/meals/meals";
import { TodayView, type TodayState } from "@/features/meals/today-view";

jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaView: View };
});
// Render the margin "!" so tests can see it (MarginRow draws it with SymbolView).
jest.mock("expo-symbols", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SymbolView: (p: { testID?: string; accessibilityLabel?: string }) => (
      <View testID={p.testID} accessibilityLabel={p.accessibilityLabel} />
    ),
  };
});
// The Compose dialog is native; expose its props through a stand-in view.
jest.mock("@expo/ui/jetpack-compose", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Host: ({ children }: { children: unknown }) => children,
    DatePickerDialog: (p: object) => <View testID="date-picker" {...p} />,
  };
});
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

// Goals.md §4 example 1 → calories 2.056, sodium upper 2000.
const example1: Profile = {
  weightKg: 70,
  heightCm: 175,
  sex: "male",
  birthYear: 1996,
  activityLevel: "moderate",
  goalType: "lose",
};
const targets = computeTargets(
  example1,
  {},
  { currentYear: 2026, workoutEnabled: false },
);
const TODAY = "2026-11-16";

const meal = (
  id: string,
  name: string,
  over: Partial<MealEntry> = {},
): MealEntry => ({
  id,
  name,
  calories: 450,
  protein: 25,
  sodium: 1800,
  sugar: 6,
  ...over,
});

async function show(state: TodayState, day = TODAY, onChangeDay = jest.fn()) {
  await render(
    <TodayView
      day={day}
      today={TODAY}
      onChangeDay={onChangeDay}
      state={state}
    />,
  );
  return onChangeDay;
}

describe("TodayView", () => {
  it("MEAL-01: an empty day shows today, the empty state and 0 / target", async () => {
    await show({ kind: "ready", meals: [], targets });
    expect(screen.getByText("16/11/2026")).toBeTruthy();
    expect(screen.getByTestId("today-empty")).toBeTruthy();
    expect(screen.getByTestId("today-calories").props.children).toBe("0");
    expect(screen.getByTestId("today-calories-target").props.children).toBe(
      " / 2.056 kcal",
    );
    expect(screen.getByTestId("today-calories-status").props.children).toBe(
      "Còn 2.056 kcal",
    );
    expect(screen.getByTestId("today-sodium-value").props.children).toBe(
      `0 / ${formatInt(targets.sodium.target)} mg`,
    );
    expect(screen.queryByTestId("margin-mark-alert")).toBeNull();
  });

  it("MEAL-07: › is disabled on today and there is no Hôm nay chip", async () => {
    const onChangeDay = await show({ kind: "ready", meals: [], targets });
    expect(screen.getByTestId("today-next").props.accessibilityState).toEqual({
      disabled: true,
    });
    expect(screen.queryByTestId("today-chip-today")).toBeNull();
    await fireEvent.press(screen.getByTestId("today-next"));
    expect(onChangeDay).not.toHaveBeenCalled();
  });

  it("‹ goes to the previous day; an earlier day offers › and the Hôm nay chip", async () => {
    const onChangeDay = await show(
      { kind: "ready", meals: [], targets },
      "2026-11-01",
    );
    expect(screen.getByText("01/11/2026")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("today-prev"));
    expect(onChangeDay).toHaveBeenLastCalledWith("2026-10-31");
    await fireEvent.press(screen.getByTestId("today-next"));
    expect(onChangeDay).toHaveBeenLastCalledWith("2026-11-02");
    await fireEvent.press(screen.getByTestId("today-chip-today"));
    expect(onChangeDay).toHaveBeenLastCalledWith(TODAY);
  });

  it("MEAL-07: the date picker opens on the viewed day and disables days after today", async () => {
    const onChangeDay = await show(
      { kind: "ready", meals: [], targets },
      "2026-11-04",
    );
    expect(screen.queryByTestId("date-picker")).toBeNull();
    await fireEvent.press(screen.getByTestId("today-date"));
    const picker = screen.getByTestId("date-picker");
    expect(picker.props.initialDate).toBe("2026-11-04T00:00:00.000Z");
    expect(picker.props.selectableDates.end).toBeInstanceOf(Date);
    expect(picker.props.selectableDates.start).toBeUndefined();
    // Last selectable day = the `today` prop (same source as "›"), as a local midnight.
    const end: Date = picker.props.selectableDates.end;
    expect(end.getTime()).toBe(new Date(2026, 10, 16).getTime());

    await fireEvent(picker, "onDateSelected", new Date(Date.UTC(2026, 10, 1)));
    expect(onChangeDay).toHaveBeenLastCalledWith("2026-11-01");
    expect(screen.queryByTestId("date-picker")).toBeNull();
  });

  it("keeps the picker's selectable range stable across re-renders", async () => {
    const onChangeDay = jest.fn();
    const ui = (state: TodayState) => (
      <TodayView
        day={TODAY}
        today={TODAY}
        onChangeDay={onChangeDay}
        state={state}
      />
    );
    const { rerender } = await render(ui({ kind: "loading" }));
    await fireEvent.press(screen.getByTestId("today-date"));
    const before = screen.getByTestId("date-picker").props.selectableDates.end;
    // Data arriving while the dialog is open must not rebuild the native picker state.
    await rerender(ui({ kind: "ready", meals: [], targets }));
    expect(screen.getByTestId("date-picker").props.selectableDates.end).toBe(
      before,
    );
  });

  it("ignores a picked day after today", async () => {
    const onChangeDay = await show({ kind: "ready", meals: [], targets });
    await fireEvent.press(screen.getByTestId("today-date"));
    await fireEvent(
      screen.getByTestId("date-picker"),
      "onDateSelected",
      new Date(Date.UTC(2026, 10, 17)),
    );
    expect(onChangeDay).not.toHaveBeenCalled();
  });

  it("lists meals in the given order with name, kcal and the nutrient line", async () => {
    await show({
      kind: "ready",
      targets,
      meals: [
        meal("a", "Bún nạm"),
        meal("b", "Cơm tấm", {
          calories: 650,
          protein: 30.5,
          sodium: 1200,
          sugar: 4.2,
        }),
        meal("c", "Trà đá", { calories: 0, protein: 0, sodium: 0, sugar: 0 }),
      ],
    });
    expect(screen.getByTestId("meal-row-0-name").props.children).toBe(
      "Bún nạm",
    );
    expect(screen.getByTestId("meal-row-1-name").props.children).toBe(
      "Cơm tấm",
    );
    expect(screen.getByTestId("meal-row-2-name").props.children).toBe("Trà đá");
    const row = within(screen.getByTestId("meal-row-1"));
    expect(row.getByText("650 kcal")).toBeTruthy();
    expect(
      row.getByText("Đạm 30,5 g · Natri 1.200 mg · Đường 4,2 g"),
    ).toBeTruthy();
    expect(screen.getByTestId("today-calories").props.children).toBe("1.100");
    expect(screen.queryByTestId("today-empty")).toBeNull();
  });

  it("past the target but under 4000 kcal: neutral 'Vượt' line, no mark", async () => {
    await show({
      kind: "ready",
      targets,
      meals: [meal("a", "Tiệc", { calories: 2400, sodium: 0 })],
    });
    expect(screen.getByTestId("today-calories-status").props.children).toBe(
      "Vượt 344 kcal",
    );
    expect(screen.queryByTestId("today-calories-over-upper")).toBeNull();
    expect(screen.queryByTestId("margin-mark-alert")).toBeNull();
  });

  it("above an upper bound: '!' in the margin plus 'Vượt ngưỡng' text, not colour alone", async () => {
    await show({
      kind: "ready",
      targets,
      meals: [meal("a", "Lẩu", { calories: 4350, sodium: 2350 })],
    });
    expect(screen.getByTestId("today-calories-over-upper").props.children).toBe(
      "Vượt ngưỡng 350 kcal",
    );
    expect(screen.getByTestId("today-sodium-over-upper").props.children).toBe(
      "Vượt ngưỡng 350 mg",
    );
    expect(screen.getAllByTestId("margin-mark-alert")).toHaveLength(2);
    expect(screen.getAllByLabelText("Vượt ngưỡng")).toHaveLength(2);
  });

  it("shows a skeleton while loading", async () => {
    await show({ kind: "loading" });
    expect(screen.getByTestId("today-loading")).toBeTruthy();
    expect(screen.queryByTestId("today-calories")).toBeNull();
  });

  it("shows an error with Thử lại that retries", async () => {
    const onRetry = jest.fn();
    await show({ kind: "error", onRetry });
    expect(screen.getByTestId("today-error")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("today-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
