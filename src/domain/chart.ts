/**
 * Biểu đồ data (Chart.md §4; ADR-009): pure helpers that turn per-day totals and the current
 * targets into what the chart draws. The chart component only draws.
 */
import { addDays, type Day } from "@/domain/day";
import type { MealNutrients } from "@/domain/meal-totals";
import type { Targets } from "@/domain/nutrition";

export type Metric = keyof MealNutrients;
export type ChartRange = 7 | 30;

/** Totals of one day that has meals (rows of rpc/daily_totals). */
export type DailyTotal = MealNutrients & { day: Day };

/** One day on the X axis; value null = no meals that day (a gap, never 0). */
export type SeriesPoint = { day: Day; label: string; value: number | null };

export type ChartKind = "bar" | "line";

/** What the Biểu đồ tab shows; kept on the device only (Chart.md §5). */
export type ChartPrefs = { metric: Metric; range: ChartRange; kind: ChartKind };

/** First visit (Chart.md §3): Calo, 7 days, bars. */
export const DEFAULT_CHART_PREFS: ChartPrefs = {
  metric: "calories",
  range: 7,
  kind: "bar",
};

const METRICS: readonly Metric[] = ["calories", "protein", "sodium", "sugar"];

/** Stored prefs → valid prefs; anything unknown or malformed falls back field by field. */
export function parseChartPrefs(raw: string | null): ChartPrefs {
  let v: Partial<Record<keyof ChartPrefs, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") v = parsed;
  } catch {
    // Malformed text from an older build: same as nothing stored.
  }
  return {
    metric: METRICS.includes(v.metric as Metric)
      ? (v.metric as Metric)
      : DEFAULT_CHART_PREFS.metric,
    range:
      v.range === 7 || v.range === 30 ? v.range : DEFAULT_CHART_PREFS.range,
    kind:
      v.kind === "bar" || v.kind === "line" ? v.kind : DEFAULT_CHART_PREFS.kind,
  };
}

export type ThresholdKind = "bmr" | "safe" | "lower" | "target" | "upper";
export type Threshold = { kind: ThresholdKind; value: number; label: string };

const LABELS: Record<ThresholdKind, string> = {
  bmr: "BMR",
  safe: "An toàn",
  lower: "Ngưỡng dưới",
  target: "Mục tiêu",
  upper: "Ngưỡng trên",
};

/** Headroom above the highest value or line, so the top line and its label are not clipped. */
const Y_HEADROOM = 1.05;

/** The days of the range, oldest first, ending on today. */
export function chartDays(today: Day, range: ChartRange): Day[] {
  return Array.from({ length: range }, (_, i) => addDays(today, i - range + 1));
}

/** "2026-11-04" → "04/11" (X-axis label). */
function shortLabel(day: Day): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/** One point per day of the range for one metric; days without meals are null (CHART-02). */
export function buildSeries(
  totals: readonly DailyTotal[],
  today: Day,
  range: ChartRange,
  metric: Metric,
): SeriesPoint[] {
  const byDay = new Map(totals.map((t) => [t.day, t]));
  return chartDays(today, range).map((day) => ({
    day,
    label: shortLabel(day),
    value: byDay.get(day)?.[metric] ?? null,
  }));
}

/** A day's totals for the detail card, or null when nothing was logged ("Chưa ghi"). */
export function totalsOn(
  totals: readonly DailyTotal[],
  day: Day,
): DailyTotal | null {
  return totals.find((t) => t.day === day) ?? null;
}

/**
 * Threshold lines from the current targets, bottom to top (Chart.md §4). Calories: BMR, safe,
 * target, upper. Others: lower, target, upper; a lower threshold of 0 (sugar) is not drawn.
 */
export function chartThresholds(t: Targets, metric: Metric): Threshold[] {
  const line = (kind: ThresholdKind, value: number): Threshold => ({
    kind,
    value,
    label: LABELS[kind],
  });
  if (metric === "calories") {
    const c = t.calories;
    return [
      line("bmr", c.bmr),
      line("safe", c.safe),
      line("target", c.target),
      line("upper", c.upper),
    ];
  }
  const n = t[metric];
  return [
    ...(n.lower > 0 ? [line("lower", n.lower)] : []),
    line("target", n.target),
    line("upper", n.upper),
  ];
}

/** Y axis from 0 to just above the highest value or threshold line. */
export function yDomain(
  series: readonly SeriesPoint[],
  thresholds: readonly Threshold[],
): [number, number] {
  const top = Math.max(
    0,
    ...series.map((p) => p.value ?? 0),
    ...thresholds.map((l) => l.value),
  );
  return [0, Math.round(top * Y_HEADROOM)];
}
