import { useRouter } from "expo-router";

import {
  chartScreenState,
  useChartPrefs,
  useDailyTotals,
} from "@/features/chart/chart";
import { ChartView } from "@/features/chart/chart-view";
import { useTargets } from "@/features/goals/goals";
import { useToday } from "@/features/meals/meals";

/** Tab Biểu đồ (issue #19). */
export default function ChartScreen() {
  const router = useRouter();
  const today = useToday();
  const totals = useDailyTotals(today);
  const targets = useTargets();
  const { prefs, ready, update } = useChartPrefs();

  const state = chartScreenState({
    totals,
    targets,
    prefsReady: ready,
    onRetry: () => {
      void totals.refetch();
      targets.refetch();
    },
  });

  return (
    <ChartView
      today={today}
      prefs={prefs}
      onChangePrefs={update}
      state={state}
      onOpenDay={(day) =>
        router.navigate({
          pathname: "/",
          // `at` makes opening the same day twice still count as a new request.
          params: { day, at: String(Date.now()) },
        })
      }
    />
  );
}
