import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { type Day, todayLocal } from "@/domain/day";
import { normalizeFoodName } from "@/domain/food-name";
import type { MealNutrients } from "@/domain/meal-totals";
import { useAuth } from "@/features/auth/auth-provider";
import type { MealInput } from "@/features/meals/meal-form";
import { saveFailureMessage } from "@/features/profile/profile";
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

/** Today's date, refreshed at local midnight and when the app returns to the foreground. */
export function useToday(): Day {
  const [today, setToday] = useState(() => todayLocal());
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setToday(todayLocal());
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const timer = setTimeout(
      () => setToday(todayLocal()),
      midnight.getTime() - now.getTime() + 1000,
    );
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}

// ------------------------------------------------------------------ writes
export type SaveResult = { ok: true } | { ok: false; message: string };

/**
 * Saves a meal through log_meal: the meal and its saved food in one transaction (MealLog.md §5).
 * `id` comes from the client and is reused when "Lưu" is pressed again after an error, so a save
 * the server already wrote is not written twice (MEAL-17). Never retried automatically (ADR-010).
 */
export async function logMeal(id: string, m: MealInput): Promise<SaveResult> {
  const { error } = await supabase.rpc("log_meal", {
    p_id: id,
    p_eaten_on: m.eatenOn,
    p_name: m.name,
    p_calories_kcal: m.calories,
    p_protein_g: m.protein,
    p_sodium_mg: m.sodium,
    p_sugar_g: m.sugar,
  });
  return error
    ? { ok: false, message: saveFailureMessage(error) }
    : { ok: true };
}

const deleteResult = (error: { message: string } | null): SaveResult =>
  error
    ? {
        ok: false,
        message: /network|fetch/i.test(error.message)
          ? saveFailureMessage(error)
          : "Không xoá được. Thử lại sau.",
      }
    : { ok: true };

/** Deletes a logged meal; its saved food stays (MEAL-12). */
export async function deleteMeal(id: string): Promise<SaveResult> {
  const { error } = await supabase.from("meal_entries").delete().eq("id", id);
  return deleteResult(error);
}

/** Deletes a saved food; logged meals keep their own copies of name and values (MEAL-13). */
export async function deleteSavedFood(id: string): Promise<SaveResult> {
  const { error } = await supabase.from("foods").delete().eq("id", id);
  return deleteResult(error);
}

/**
 * After a write: every day's list (a save can move a meal to another day), suggestions and the
 * saved-food list (a save updates its saved food).
 */
function useRefreshAfterWrite() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;
  return async (result: SaveResult) => {
    if (!result.ok) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["meals", userId] }),
      queryClient.invalidateQueries({ queryKey: ["food-suggestions", userId] }),
      queryClient.invalidateQueries({ queryKey: ["saved-foods", userId] }),
    ]);
  };
}

export function useLogMeal() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: ({ id, meal }: { id: string; meal: MealInput }) =>
      logMeal(id, meal),
    onSuccess: refresh,
  });
}

export function useDeleteMeal() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: deleteMeal, onSuccess: refresh });
}

export function useDeleteSavedFood() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: deleteSavedFood, onSuccess: refresh });
}

// ------------------------------------------------------------- suggestions
export type FoodSuggestion = MealNutrients & { id: string; name: string };

type FoodRow = Omit<MealRow, "id"> & { id: string };

/** Typed text after a pause, so suggestions are not fetched on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Up to 5 saved foods for the typed name (suggest_foods: diacritic-insensitive, "starts with"
 * before "contains", most recently used first; MEAL-03, MEAL-04, MEAL-14).
 */
export function useFoodSuggestions(text: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const query = normalizeFoodName(useDebounced(text, 250));
  return useQuery({
    queryKey: ["food-suggestions", userId, query] as const,
    enabled: !!userId && query.length > 0,
    queryFn: async (): Promise<FoodSuggestion[]> => {
      const { data, error } = await supabase.rpc("suggest_foods", {
        p_query: query,
      });
      if (error) throw error;
      return (data as FoodRow[]).map(fromRow);
    },
  });
}

// ------------------------------------------------------------ saved foods
export type SavedFood = FoodSuggestion;

/** All saved foods of the user, A→Z by normalized name, for Cài đặt › Món đã lưu (MealLog.md §2). */
export function useSavedFoods() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["saved-foods", userId] as const,
    enabled: !!userId,
    queryFn: async (): Promise<SavedFood[]> => {
      const { data, error } = await supabase
        .from("foods")
        .select("id, name, calories_kcal, protein_g, sodium_mg, sugar_g")
        .order("name_normalized")
        .order("id");
      if (error) throw error;
      return (data as FoodRow[]).map(fromRow);
    },
  });
}
