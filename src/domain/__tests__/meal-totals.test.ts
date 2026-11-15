import { describe, expect, it } from "@jest/globals";

import {
  calorieStatus,
  fillFraction,
  nutrientStatus,
  sumMeals,
  ZERO_TOTALS,
} from "@/domain/meal-totals";
import { computeTargets, type Profile } from "@/domain/nutrition";

// Goals.md §4 example 1: male, 70 kg, 175 cm, 30 years, moderate, lose → target 2.056 kcal.
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

describe("sumMeals (MealLog.md §4: total of the day)", () => {
  it("is zero for a day without meals", () => {
    expect(sumMeals([])).toEqual(ZERO_TOTALS);
  });

  it("adds every meal and keeps one decimal for protein and sugar", () => {
    const totals = sumMeals([
      { calories: 450, protein: 25, sodium: 1800, sugar: 6 },
      { calories: 120, protein: 0.1, sodium: 5, sugar: 0.2 },
      { calories: 0, protein: 0.2, sodium: 0, sugar: 0.1 },
    ]);
    expect(totals).toEqual({
      calories: 570,
      protein: 25.3,
      sodium: 1805,
      sugar: 6.3,
    });
  });
});

describe("calorieStatus (owner decision 2026-11-16)", () => {
  it("uses example 1's target of 2.056 kcal", () => {
    expect(targets.calories.target).toBe(2056);
  });

  it("shows what remains up to the target, neutral", () => {
    expect(calorieStatus(0, targets.calories)).toEqual({
      kind: "remaining",
      amount: 2056,
      overUpper: null,
    });
    expect(calorieStatus(2056, targets.calories)).toEqual({
      kind: "remaining",
      amount: 0,
      overUpper: null,
    });
  });

  it("says how far past the target, still neutral below the 4000 upper bound", () => {
    expect(calorieStatus(2400, targets.calories)).toEqual({
      kind: "over",
      amount: 344,
      overUpper: null,
    });
  });

  it("flags only intake above the upper bound", () => {
    expect(calorieStatus(4000, targets.calories).overUpper).toBeNull();
    expect(calorieStatus(4350, targets.calories)).toEqual({
      kind: "over",
      amount: 2294,
      overUpper: 350,
    });
  });
});

describe("nutrientStatus", () => {
  it("flags sodium above 2000 mg by the amount past the upper bound", () => {
    expect(nutrientStatus(2000, targets.sodium).overUpper).toBeNull();
    expect(nutrientStatus(2350, targets.sodium).overUpper).toBe(350);
  });

  it("rounds a decimal overshoot to one decimal", () => {
    const over = nutrientStatus(
      targets.sugar.upper + 0.30000000000000004,
      targets.sugar,
    );
    expect(over.overUpper).toBe(0.3);
  });
});

describe("fillFraction", () => {
  it("is the share of the target, capped at 1", () => {
    expect(fillFraction(0, 2056)).toBe(0);
    expect(fillFraction(1028, 2056)).toBe(0.5);
    expect(fillFraction(5000, 2056)).toBe(1);
  });

  it("is full for any intake when the target is 0", () => {
    expect(fillFraction(0, 0)).toBe(0);
    expect(fillFraction(10, 0)).toBe(1);
  });
});
