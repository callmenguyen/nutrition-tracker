import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { type Day, todayLocal } from "@/domain/day";
import type { MealNutrients } from "@/domain/meal-totals";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase";

/** A logged meal as shown on Hôm nay (MealLog.md §5; values are copies, not links to foods). */
export type MealEntry = MealNutrients & { id: string; name: string };

type MealRow = {
  id: string;
  name: string;
  calories_kcal: number;
  protein_g: number | string;
  sodium_mg: number;
  sugar_g: number | string;
};

// numeric(4,1) may arrive as text depending on the server; Number() accepts both.
const fromRow = (r: MealRow): MealEntry => ({
  id: r.id,
  name: r.name,
  calories: r.calories_kcal,
  protein: Number(r.protein_g),
  sodium: r.sodium_mg,
  sugar: Number(r.sugar_g),
});

export const mealsKey = (userId: string | undefined, day: Day) =>
  ["meals", userId, day] as const;

/**
 * Meals of one day in creation order. The server assigns created_at and never changes it on edit,
 * so editing a meal keeps its place (MEAL-11); id breaks ties. RLS keeps it to the owner's rows.
 */
export function useMealsForDay(day: Day) {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: mealsKey(userId, day),
    enabled: !!userId,
    queryFn: async (): Promise<MealEntry[]> => {
      const { data, error } = await supabase
        .from("meal_entries")
        .select("id, name, calories_kcal, protein_g, sodium_mg, sugar_g")
        .eq("eaten_on", day)
        .order("created_at")
        .order("id");
      if (error) throw error;
      return (data as MealRow[]).map(fromRow);
    },
  });
}

/** Today's date, refreshed when the app returns to the foreground (e.g. after midnight). */
export function useToday(): Day {
  const [today, setToday] = useState(() => todayLocal());
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setToday(todayLocal());
    });
    return () => sub.remove();
  }, []);
  return today;
}
