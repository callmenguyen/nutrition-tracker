/**
 * Day totals and their status against the targets (MealLog.md §2, §4).
 * Owner decision 2026-11-16: "Còn / Vượt X kcal" compares with the target and stays neutral;
 * only intake above the upper bound (calories 4000, nutrients' `upper`) is flagged.
 */
import type { CalorieTarget, NutrientTarget } from "@/domain/nutrition";

export type MealNutrients = {
  calories: number;
  protein: number;
  sodium: number;
  sugar: number;
};

export const ZERO_TOTALS: MealNutrients = {
  calories: 0,
  protein: 0,
  sodium: 0,
  sugar: 0,
};

/** One decimal, like numeric(4,1); also removes float noise such as 0.1 + 0.2. */
const round1 = (n: number) => Math.round(n * 10) / 10;

export function sumMeals(entries: readonly MealNutrients[]): MealNutrients {
  const sum = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      sodium: acc.sodium + e.sodium,
      sugar: acc.sugar + e.sugar,
    }),
    ZERO_TOTALS,
  );
  return { ...sum, protein: round1(sum.protein), sugar: round1(sum.sugar) };
}

export type CalorieStatus = {
  /** "remaining" up to the target (also when exactly on it), or "over" the target. */
  kind: "remaining" | "over";
  /** Distance to the target, always ≥ 0. */
  amount: number;
  /** How far above the upper bound, or null when not above it. */
  overUpper: number | null;
};

export function calorieStatus(total: number, t: CalorieTarget): CalorieStatus {
  return {
    kind: total > t.target ? "over" : "remaining",
    amount: Math.abs(t.target - total),
    overUpper: total > t.upper ? total - t.upper : null,
  };
}

export type NutrientStatus = { overUpper: number | null };

export function nutrientStatus(
  total: number,
  t: NutrientTarget,
): NutrientStatus {
  return { overUpper: total > t.upper ? round1(total - t.upper) : null };
}

/** Share of the target for a fixed-length capacity bar, capped at 1. */
export function fillFraction(total: number, target: number): number {
  if (target <= 0) return total > 0 ? 1 : 0;
  return Math.min(total / target, 1);
}
