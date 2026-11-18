import { useRouter } from "expo-router";

import { useDeleteSavedFood, useSavedFoods } from "@/features/meals/meals";
import {
  SavedFoodsView,
  type SavedFoodsState,
} from "@/features/meals/saved-foods-view";

/** Cài đặt › Món đã lưu (MealLog.md §2; MEAL-13). */
export default function SavedFoodsScreen() {
  const router = useRouter();
  const foods = useSavedFoods();
  const remove = useDeleteSavedFood();
  const state: SavedFoodsState = foods.data
    ? { status: "ready", foods: foods.data }
    : foods.isError
      ? { status: "error" }
      : { status: "loading" };

  return (
    <SavedFoodsView
      state={state}
      onDelete={remove.mutateAsync}
      onRetry={() => void foods.refetch()}
      onBack={() => router.back()}
    />
  );
}
