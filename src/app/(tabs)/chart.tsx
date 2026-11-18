import { useRouter } from "expo-router";

import { useChartPrefs, useDailyTotals } from "@/features/chart/chart";
import { type ChartState, ChartView } from "@/features/chart/chart-view";
import { useTargets } from "@/features/goals/goals";
import { useToday } from "@/features/meals/meals";

/** Tab Biểu đồ (issue #19). */
export default function ChartScreen() {
  const router = useRouter();
  const today = useToday();
  const totals = useDailyTotals(today);
  const targets = useTargets();
  const { prefs, ready, update } = useChartPrefs();

  // CHART-13: a failed load shows the error even if older totals are cached, never stale numbers.
  const state: ChartState =
    totals.isError || (targets.isError && !targets.targets)
      ? {
          kind: "error",
          onRetry: () => {
            void totals.refetch();
            targets.refetch();
          },
        }
      : ready && totals.data && targets.targets
        ? { kind: "ready", totals: totals.data, targets: targets.targets }
        : { kind: "loading" };

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
