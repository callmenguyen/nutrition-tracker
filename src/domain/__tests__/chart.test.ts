import { describe, expect, it } from "@jest/globals";

import {
  buildSeries,
  chartDays,
  chartThresholds,
  type DailyTotal,
  DEFAULT_CHART_PREFS,
  parseChartPrefs,
  spreadLabelPositions,
  totalsOn,
  yDomain,
} from "@/domain/chart";
import { computeTargets, type Profile } from "@/domain/nutrition";

// Goals.md §4 example 1.
const EXAMPLE_1: Profile = {
  weightKg: 70,
  heightCm: 175,
  sex: "male",
  birthYear: 1996,
  activityLevel: "moderate",
  goalType: "lose",
};
const opts = { currentYear: 2026, workoutEnabled: false };
const TODAY = "2026-11-18";

const total = (day: string, calories: number): DailyTotal => ({
  day,
  calories,
  protein: 25,
  sodium: 1800,
  sugar: 6.5,
});

describe("chartDays", () => {
  it("ends on today, oldest first, across a month boundary", () => {
    expect(chartDays("2026-12-02", 7)).toEqual([
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
    expect(chartDays(TODAY, 30)).toHaveLength(30);
    expect(chartDays(TODAY, 30)[0]).toBe("2026-10-20");
  });
});

describe("buildSeries", () => {
  const totals = [
    total("2026-11-11", 9999), // outside the 7-day range
    total("2026-11-13", 1500),
    total("2026-11-15", 2100),
    total("2026-11-18", 450),
  ];

  it("CHART-02: 3 of 7 days have values; the other 4 are gaps (null), never 0", () => {
    const series = buildSeries(totals, TODAY, 7, "calories");
    expect(series.map((p) => p.value)).toEqual([
      null,
      1500,
      null,
      2100,
      null,
      null,
      450,
    ]);
    expect(series.map((p) => p.label)).toEqual([
      "12/11",
      "13/11",
      "14/11",
      "15/11",
      "16/11",
      "17/11",
      "18/11",
    ]);
  });

  it("CHART-03: a day's value is that day's total for the chosen metric", () => {
    const series = buildSeries(totals, TODAY, 30, "sugar");
    expect(series.find((p) => p.day === "2026-11-11")?.value).toBe(6.5);
    expect(series.filter((p) => p.value !== null)).toHaveLength(4);
  });

  it("a day with meals that sum to 0 is drawn as 0, not as a gap", () => {
    const series = buildSeries([total(TODAY, 0)], TODAY, 7, "calories");
    expect(series.at(-1)?.value).toBe(0);
  });
});

describe("totalsOn", () => {
  it("gives a day's totals, or null for a day without meals", () => {
    const totals = [total("2026-11-15", 2100)];
    expect(totalsOn(totals, "2026-11-15")).toMatchObject({ calories: 2100 });
    expect(totalsOn(totals, "2026-11-16")).toBeNull();
  });
});

describe("chartThresholds (Chart.md §4)", () => {
  const t = computeTargets(EXAMPLE_1, {}, opts);
  const values = (metric: Parameters<typeof chartThresholds>[1]) =>
    chartThresholds(t, metric).map((l) => [l.kind, l.value]);

  it("CHART-04: example 1 lines for each metric", () => {
    expect(values("calories")).toEqual([
      ["bmr", 1649],
      ["safe", 1949],
      ["target", 2056],
      ["upper", 4000],
    ]);
    expect(values("protein")).toEqual([
      ["lower", 56],
      ["target", 112],
      ["upper", 154],
    ]);
    expect(values("sodium")).toEqual([
      ["lower", 500],
      ["target", 1500],
      ["upper", 2000],
    ]);
    // Sugar's lower threshold is 0, so it is not drawn.
    expect(values("sugar")).toEqual([
      ["target", 26],
      ["upper", 51],
    ]);
  });

  it("CHART-05: a custom calorie target of 1800 moves the target line and sugar's upper line", () => {
    const custom = computeTargets(EXAMPLE_1, { calorieTarget: 1800 }, opts);
    expect(
      chartThresholds(custom, "calories").find((l) => l.kind === "target")
        ?.value,
    ).toBe(1800);
    expect(
      chartThresholds(custom, "sugar").find((l) => l.kind === "upper")?.value,
    ).toBe(45);
  });

  it("labels every line in Vietnamese", () => {
    expect(chartThresholds(t, "calories").map((l) => l.label)).toEqual([
      "BMR",
      "An toàn",
      "Mục tiêu",
      "Ngưỡng trên",
    ]);
    expect(chartThresholds(t, "protein")[0].label).toBe("Ngưỡng dưới");
  });
});

describe("yDomain", () => {
  const lines = chartThresholds(
    computeTargets(EXAMPLE_1, {}, opts),
    "calories",
  );

  it("starts at 0 and leaves room above the upper line when values are lower", () => {
    const series = buildSeries([total(TODAY, 2100)], TODAY, 7, "calories");
    expect(yDomain(series, lines)).toEqual([0, 4200]);
  });

  it("grows past the upper line for a larger value", () => {
    const series = buildSeries([total(TODAY, 5000)], TODAY, 7, "calories");
    expect(yDomain(series, lines)).toEqual([0, 5250]);
  });

  it("CHART-01: an empty range still fits the threshold lines", () => {
    const series = buildSeries([], TODAY, 7, "calories");
    expect(yDomain(series, lines)).toEqual([0, 4200]);
  });
});

describe("parseChartPrefs", () => {
  it("defaults to Calo, 7 days, bars when nothing is stored", () => {
    expect(parseChartPrefs(null)).toEqual({
      metric: "calories",
      range: 7,
      kind: "bar",
    });
  });

  it("CHART-06: reads back what was saved", () => {
    const saved = { metric: "sodium", range: 30, kind: "line" } as const;
    expect(parseChartPrefs(JSON.stringify(saved))).toEqual(saved);
  });

  it("falls back field by field for unknown or malformed values", () => {
    expect(
      parseChartPrefs(JSON.stringify({ metric: "fat", range: 30, kind: 1 })),
    ).toEqual({ ...DEFAULT_CHART_PREFS, range: 30 });
    expect(parseChartPrefs("{not json")).toEqual(DEFAULT_CHART_PREFS);
    expect(parseChartPrefs("[]")).toEqual(DEFAULT_CHART_PREFS);
  });
});

describe("spreadLabelPositions", () => {
  it("keeps labels just above lines that are far apart", () => {
    expect(spreadLabelPositions([100, 40], 14, 4)).toEqual([96, 36]);
  });

  it("pushes a label down when it would overlap the one above (example 1: An toàn / Mục tiêu)", () => {
    // Lines at 1949 and 2056 kcal are ~5 px apart on a 0–4200 axis.
    expect(spreadLabelPositions([120, 115, 10], 14, 4)).toEqual([125, 111, 6]);
  });

  it("separates two lines drawn at the same value", () => {
    expect(spreadLabelPositions([80, 80], 14, 4)).toEqual([76, 90]);
  });
});
