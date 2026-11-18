import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  type ChartPrefs,
  type DailyTotal,
  DEFAULT_CHART_PREFS,
  parseChartPrefs,
} from "@/domain/chart";
import { addDays, type Day } from "@/domain/day";
import { useAuth } from "@/features/auth/auth-provider";
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

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CHART_PREFS_STORAGE_KEY)
      // Storage unavailable: show the first-visit choice; nothing else depends on it.
      .catch(() => null)
      .then((raw) => {
        if (!alive) return;
        setPrefs(parseChartPrefs(raw));
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((change: Partial<ChartPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...change };
      // A failed write only means the choice is not remembered next time.
      AsyncStorage.setItem(CHART_PREFS_STORAGE_KEY, JSON.stringify(next)).catch(
        () => undefined,
      );
      return next;
    });
  }, []);

  return { prefs, ready, update };
}
