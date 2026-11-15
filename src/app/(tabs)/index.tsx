import { useState } from "react";

import type { Day } from "@/domain/day";
import { useTargets } from "@/features/goals/goals";
import { useMealsForDay, useToday } from "@/features/meals/meals";
import { type TodayState, TodayView } from "@/features/meals/today-view";

/** Tab Hôm nay (issue #16). */
export default function TodayScreen() {
  const today = useToday();
  // null = follow today, so viewing "today" stays on today after midnight.
  const [picked, setPicked] = useState<Day | null>(null);
  const day = picked ?? today;
  const meals = useMealsForDay(day);
  const targets = useTargets();

  const state: TodayState =
    meals.isError || targets.isError
      ? {
          kind: "error",
          onRetry: () => {
            void meals.refetch();
            targets.refetch();
          },
        }
      : meals.data && targets.targets
        ? { kind: "ready", meals: meals.data, targets: targets.targets }
        : { kind: "loading" };

  return (
    <TodayView
      day={day}
      today={today}
      onChangeDay={(d) => setPicked(d === today ? null : d)}
      state={state}
    />
  );
}
