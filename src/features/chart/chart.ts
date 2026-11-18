import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ChartPrefs,
  type DailyTotal,
  DEFAULT_CHART_PREFS,
  parseChartPrefs,
} from "@/domain/chart";
import { addDays, type Day } from "@/domain/day";
import type { Targets } from "@/domain/nutrition";
import { useAuth } from "@/features/auth/auth-provider";
import type { ChartState } from "@/features/chart/chart-view";
import { supabase } from "@/lib/supabase";

/** Days fetched at once: the 30-day range; the 7-day range is a slice of it (Chart.md §3). */
const FETCH_DAYS = 30;

type DailyTotalRow = {
  eaten_on: string;
  calories_kcal: number;
  protein_g: number | string;
  sodium_mg: number;
  sugar_g: number | string;
};

// numeric may arrive as text depending on the server; Number() accepts both.
const fromRow = (r: DailyTotalRow): DailyTotal => ({
  day: r.eaten_on,
  calories: r.calories_kcal,
  protein: Number(r.protein_g),
  sodium: r.sodium_mg,
  sugar: Number(r.sugar_g),
});

export const dailyTotalsKey = (userId: string | undefined, today: Day) =>
  ["daily-totals", userId, today] as const;

/**
 * Per-day totals for [today − 29, today] from rpc/daily_totals (RLS keeps them to the caller,
 * CHART-12). Refreshed after every meal write (useRefreshAfterWrite in features/meals).
 */
export function useDailyTotals(today: Day) {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: dailyTotalsKey(userId, today),
    enabled: !!userId,
    queryFn: async (): Promise<DailyTotal[]> => {
      const { data, error } = await supabase.rpc("daily_totals", {
        p_from: addDays(today, 1 - FETCH_DAYS),
        p_to: today,
      });
      if (error) throw error;
      return (data as DailyTotalRow[]).map(fromRow);
    },
  });
}

export const CHART_PREFS_STORAGE_KEY = "chart-prefs";

/**
 * Metric, range and chart kind, remembered on this device (CHART-06; Chart.md §5). `ready` is
 * false until the stored choice has been read, so the first frame does not flash the default.
 */
export function useChartPrefs(): {
  prefs: ChartPrefs;
  ready: boolean;
  update: (change: Partial<ChartPrefs>) => void;
} {
  const [prefs, setPrefs] = useState<ChartPrefs>(DEFAULT_CHART_PREFS);
  const [ready, setReady] = useState(false);
  // Latest prefs for update(), so the state updater stays pure and storage is written once.
  const current = useRef(prefs);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CHART_PREFS_STORAGE_KEY)
      // Storage unavailable: show the first-visit choice; nothing else depends on it.
      .catch(() => null)
      .then((raw) => {
        if (!alive) return;
        current.current = parseChartPrefs(raw);
        setPrefs(current.current);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((change: Partial<ChartPrefs>) => {
    const next = { ...current.current, ...change };
    current.current = next;
    setPrefs(next);
    // A failed write only means the choice is not remembered next time.
    AsyncStorage.setItem(CHART_PREFS_STORAGE_KEY, JSON.stringify(next)).catch(
      () => undefined,
    );
  }, []);

  return { prefs, ready, update };
}

/**
 * Screen state from the queries (CHART-13): a failed load shows the error even when older totals
 * are cached, never stale numbers; while "Thử lại" refetches after an error, it shows loading.
 */
export function chartScreenState(input: {
  totals: { data?: DailyTotal[]; isError: boolean; isFetching: boolean };
  targets: { targets?: Targets; isError: boolean };
  prefsReady: boolean;
  onRetry: () => void;
}): ChartState {
  const { totals, targets, prefsReady, onRetry } = input;
  if (totals.isError && totals.isFetching) return { kind: "loading" };
  if (totals.isError || (targets.isError && !targets.targets)) {
    return { kind: "error", onRetry };
  }
  return prefsReady && totals.data && targets.targets
    ? { kind: "ready", totals: totals.data, targets: targets.targets }
    : { kind: "loading" };
}
