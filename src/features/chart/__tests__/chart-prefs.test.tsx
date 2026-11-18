import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { CHART_PREFS_STORAGE_KEY, useChartPrefs } from "@/features/chart/chart";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("useChartPrefs (CHART-06)", () => {
  it("starts with Calo, 7 days, bars and becomes ready", async () => {
    const { result } = await renderHook(() => useChartPrefs());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.prefs).toEqual({
      metric: "calories",
      range: 7,
      kind: "bar",
    });
  });

  it("remembers a change for the next time the tab opens", async () => {
    const first = await renderHook(() => useChartPrefs());
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    await act(async () => first.result.current.update({ range: 30 }));
    await act(async () => first.result.current.update({ kind: "line" }));
    expect(
      JSON.parse((await AsyncStorage.getItem(CHART_PREFS_STORAGE_KEY))!),
    ).toEqual({ metric: "calories", range: 30, kind: "line" });

    const again = await renderHook(() => useChartPrefs());
    await waitFor(() => expect(again.result.current.ready).toBe(true));
    expect(again.result.current.prefs).toEqual({
      metric: "calories",
      range: 30,
      kind: "line",
    });
  });

  it("falls back to the first-visit choice when storage cannot be read", async () => {
    jest
      .spyOn(AsyncStorage, "getItem")
      .mockRejectedValueOnce(new Error("unavailable"));
    const { result } = await renderHook(() => useChartPrefs());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.prefs.metric).toBe("calories");
  });
});
