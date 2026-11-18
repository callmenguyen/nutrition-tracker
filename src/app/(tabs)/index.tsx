import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { type Day, parseRequestedDay } from "@/domain/day";
import { useTargets } from "@/features/goals/goals";
import { MealSheet, type SheetTarget } from "@/features/meals/meal-sheet";
import {
  useDeleteMeal,
  useLogMeal,
  useMealsForDay,
  useToday,
} from "@/features/meals/meals";
import { type TodayState, TodayView } from "@/features/meals/today-view";

/** Tab Hôm nay (issues #16, #17). */
export default function TodayScreen() {
  const today = useToday();
  // null = follow today, so viewing "today" stays on today after midnight.
  const [picked, setPicked] = useState<Day | null>(null);
  const day = picked ?? today;

  // "Mở ngày này" on Biểu đồ (CHART-07): ?day=YYYY-MM-DD&at=<time>; `at` is new on every
  // request, so the same day can be opened again. Applied once per request, during render.
  const { day: requested, at } = useLocalSearchParams<{
    day?: string;
    at?: string;
  }>();
  const request = requested && at ? `${requested}@${at}` : undefined;
  const [handled, setHandled] = useState<string | undefined>(undefined);
  if (request !== handled) {
    setHandled(request);
    const asked = parseRequestedDay(requested, today);
    if (asked) setPicked(asked === today ? null : asked);
  }
  const meals = useMealsForDay(day);
  const targets = useTargets();
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const logMeal = useLogMeal();
  const deleteMeal = useDeleteMeal();

  // A failed background refetch keeps showing the data already loaded.
  const failed =
    (meals.isError && !meals.data) || (targets.isError && !targets.targets);
  const state: TodayState = failed
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
    <>
      <TodayView
        day={day}
        today={today}
        onChangeDay={(d) => setPicked(d === today ? null : d)}
        state={state}
        onAdd={() => setSheet({ mode: "add", day })}
        onEdit={(meal) => setSheet({ mode: "edit", meal, day })}
      />
      <MealSheet
        target={sheet}
        today={today}
        onClose={() => setSheet(null)}
        onSave={(id, meal) => logMeal.mutateAsync({ id, meal })}
        onDelete={(id) => deleteMeal.mutateAsync(id)}
      />
    </>
  );
}
