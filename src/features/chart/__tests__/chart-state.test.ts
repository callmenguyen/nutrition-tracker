import { describe, expect, it, jest } from "@jest/globals";

import { computeTargets } from "@/domain/nutrition";
import { chartScreenState } from "@/features/chart/chart";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

const targets = computeTargets(
  {
    weightKg: 70,
    heightCm: 175,
    sex: "male",
    birthYear: 1996,
    activityLevel: "moderate",
    goalType: "lose",
  },
  {},
  { currentYear: 2026, workoutEnabled: false },
);
const cached = [
  { day: "2026-11-15", calories: 2100, protein: 25, sodium: 1800, sugar: 6 },
];
const onRetry = () => undefined;
const ok = { isError: false, isFetching: false };

describe("chartScreenState", () => {
  it("is ready once totals, targets and prefs are in", () => {
    expect(
      chartScreenState({
        totals: { ...ok, data: cached },
        targets: { targets, isError: false },
        prefsReady: true,
        onRetry,
      }),
    ).toEqual({ kind: "ready", totals: cached, targets });
  });

  it("waits for the stored prefs before drawing", () => {
    expect(
      chartScreenState({
        totals: { ...ok, data: cached },
        targets: { targets, isError: false },
        prefsReady: false,
        onRetry,
      }).kind,
    ).toBe("loading");
  });

  it("CHART-13: a failed load shows the error even with older totals cached", () => {
    expect(
      chartScreenState({
        totals: { data: cached, isError: true, isFetching: false },
        targets: { targets, isError: false },
        prefsReady: true,
        onRetry,
      }),
    ).toEqual({ kind: "error", onRetry });
  });

  it("shows loading while 'Thử lại' refetches after an error", () => {
    expect(
      chartScreenState({
        totals: { data: cached, isError: true, isFetching: true },
        targets: { targets, isError: false },
        prefsReady: true,
        onRetry,
      }).kind,
    ).toBe("loading");
  });

  it("keeps cached targets after a failed targets refetch, errors without any", () => {
    const totals = { ...ok, data: cached };
    expect(
      chartScreenState({
        totals,
        targets: { targets, isError: true },
        prefsReady: true,
        onRetry,
      }).kind,
    ).toBe("ready");
    expect(
      chartScreenState({
        totals,
        targets: { isError: true },
        prefsReady: true,
        onRetry,
      }).kind,
    ).toBe("error");
  });
});
