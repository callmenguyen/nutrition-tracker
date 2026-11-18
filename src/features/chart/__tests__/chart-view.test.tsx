import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import {
  type ChartPrefs,
  type DailyTotal,
  DEFAULT_CHART_PREFS,
} from "@/domain/chart";
import { computeTargets, type Profile } from "@/domain/nutrition";
import type { ChartCanvasProps } from "@/features/chart/chart-canvas";
import { type ChartState, ChartView } from "@/features/chart/chart-view";

jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaView: View };
});
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
// Skia does not run in Jest: the canvas is a stand-in that keeps its last props.
const canvas: { props: ChartCanvasProps | null } = { props: null };
jest.mock("@/features/chart/chart-canvas", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ChartCanvas: (p: ChartCanvasProps) => {
      canvas.props = p;
      return <View testID="chart-canvas" />;
    },
  };
});

// Goals.md §4 example 1.
const EXAMPLE_1: Profile = {
  weightKg: 70,
  heightCm: 175,
  sex: "male",
  birthYear: 1996,
  activityLevel: "moderate",
  goalType: "lose",
};
const targets = computeTargets(
  EXAMPLE_1,
  {},
  {
    currentYear: 2026,
    workoutEnabled: false,
  },
);
const TODAY = "2026-11-18";
const total = (day: string, calories: number): DailyTotal => ({
  day,
  calories,
  protein: 28.5,
  sodium: 1820,
  sugar: 36.5,
});
// CHART-02: meals on 3 of the last 7 days.
const TOTALS = [
  total("2026-11-13", 1500),
  total("2026-11-15", 2100),
  total("2026-11-18", 450),
];

const onChangePrefs = jest.fn<(c: Partial<ChartPrefs>) => void>();
const onOpenDay = jest.fn<(day: string) => void>();
const onRetry = jest.fn();

beforeEach(() => {
  onChangePrefs.mockReset();
  onOpenDay.mockReset();
  onRetry.mockReset();
  canvas.props = null;
});

async function show(
  state: ChartState,
  prefs: ChartPrefs = DEFAULT_CHART_PREFS,
) {
  await render(
    <ChartView
      today={TODAY}
      prefs={prefs}
      onChangePrefs={onChangePrefs}
      state={state}
      onOpenDay={onOpenDay}
    />,
  );
}
const ready: ChartState = { kind: "ready", totals: TOTALS, targets };

const tableValues = () =>
  screen
    .queryAllByTestId(/^chart-row-\d+-value$/)
    .map((n) => n.props.children as string);

describe("ChartView (tab Biểu đồ)", () => {
  it("CHART-02: draws 3 values and 4 gaps; the table says 'Chưa ghi' for the gaps", async () => {
    await show(ready);
    expect(canvas.props?.series.map((p) => p.value)).toEqual([
      null,
      1500,
      null,
      2100,
      null,
      null,
      450,
    ]);
    expect(canvas.props?.kind).toBe("bar");
    await fireEvent.press(screen.getByTestId("chart-table-toggle"));
    expect(tableValues()).toEqual([
      "Chưa ghi",
      "1.500 kcal",
      "Chưa ghi",
      "2.100 kcal",
      "Chưa ghi",
      "Chưa ghi",
      "450 kcal",
    ]);
    expect(screen.getByTestId("chart-row-1").props.accessibilityLabel).toBe(
      "13/11, 1.500 kcal",
    );
  });

  it("CHART-04: example 1 threshold lines are drawn and listed in the legend", async () => {
    await show(ready);
    expect(canvas.props?.thresholds.map((l) => l.value)).toEqual([
      1649, 1949, 2056, 4000,
    ]);
    expect(screen.getByText("Mục tiêu 2.056 kcal")).toBeTruthy();
    expect(screen.getByText("Ngưỡng trên 4.000 kcal")).toBeTruthy();
  });

  it("formats grams with a decimal comma for Đạm and Đường", async () => {
    await show(ready, { metric: "sugar", range: 7, kind: "line" });
    await fireEvent.press(screen.getByTestId("chart-table-toggle"));
    expect(tableValues()[1]).toBe("36,5 g");
    expect(canvas.props?.kind).toBe("line");
  });

  it("CHART-01: an empty range says so and still draws the Calo threshold lines", async () => {
    await show({ kind: "ready", totals: [], targets });
    expect(screen.getByTestId("chart-empty")).toBeTruthy();
    expect(canvas.props?.thresholds).toHaveLength(4);
  });

  it("CHART-06: the pickers report the new metric, range and kind", async () => {
    await show(ready);
    await fireEvent.press(screen.getByTestId("chart-metric-sodium"));
    await fireEvent.press(screen.getByTestId("chart-range-30"));
    await fireEvent.press(screen.getByTestId("chart-kind-line"));
    expect(onChangePrefs.mock.calls).toEqual([
      [{ metric: "sodium" }],
      [{ range: 30 }],
      [{ kind: "line" }],
    ]);
  });

  it("CHART-07: tapping a day shows its card; 'Mở ngày này' opens that day", async () => {
    await show(ready);
    expect(screen.queryByTestId("chart-detail")).toBeNull();
    await act(async () => canvas.props?.onSelectDay("2026-11-15"));
    expect(screen.getByTestId("chart-detail-day").props.children).toBe(
      "15/11/2026",
    );
    expect(screen.getByTestId("chart-detail-sodium").props.children).toBe(
      "Natri 1.820 mg",
    );
    await fireEvent.press(screen.getByTestId("chart-open-day"));
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-15");
  });

  it("a day without meals shows 'Chưa ghi' in its card; table rows also select a day", async () => {
    await show(ready);
    await fireEvent.press(screen.getByTestId("chart-table-toggle"));
    await fireEvent.press(screen.getByTestId("chart-row-0"));
    expect(screen.getByTestId("chart-detail-day").props.children).toBe(
      "12/11/2026",
    );
    expect(screen.getByTestId("chart-detail-none")).toBeTruthy();
    // One card, under the chosen row (not up by the chart, off screen from a long table).
    expect(screen.getAllByTestId("chart-detail")).toHaveLength(1);
  });

  it("CHART-13: the error state has 'Thử lại' and no chart", async () => {
    await show({ kind: "error", onRetry });
    expect(screen.getByTestId("chart-error")).toBeTruthy();
    expect(screen.queryByTestId("chart-canvas")).toBeNull();
    await fireEvent.press(screen.getByTestId("chart-retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows a loading block while loading", async () => {
    await show({ kind: "loading" });
    expect(screen.getByTestId("chart-loading")).toBeTruthy();
    expect(screen.queryByTestId("chart-canvas")).toBeNull();
  });
});
