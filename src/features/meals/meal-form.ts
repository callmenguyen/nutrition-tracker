import { z } from "zod";

import { type Day, isAfterDay } from "@/domain/day";
import { cleanFoodName, FOOD_NAME_MAX } from "@/domain/food-name";
import { formatInt } from "@/domain/format";
import type { MealNutrients } from "@/domain/meal-totals";

/** Numbers are typed as text; a decimal comma ("25,5") is accepted (MealLog.md §4). */
export type MealFormValues = {
  name: string;
  calories: string;
  protein: string;
  sodium: string;
  sugar: string;
  eatenOn: Day;
};

export type MealInput = MealNutrients & { name: string; eatenOn: Day };

export const emptyMealForm = (eatenOn: Day): MealFormValues => ({
  name: "",
  calories: "",
  protein: "",
  sodium: "",
  sugar: "",
  eatenOn,
});

/** Input text for a stored number: no thousands dots, decimal comma ("1800", "25,5"). */
const inputText = (n: number) => String(n).replace(".", ",");

/** Fills the form from a logged meal or a saved-food suggestion. */
export function toMealFormValues(
  m: MealNutrients & { name: string },
  eatenOn: Day,
): MealFormValues {
  return {
    name: m.name,
    calories: inputText(m.calories),
    protein: inputText(m.protein),
    sodium: inputText(m.sodium),
    sugar: inputText(m.sugar),
    eatenOn,
  };
}

/** One message per field, in order: blank → not a number → out of range. */
function integerField(label: string, max: number, unit: string) {
  return z
    .string()
    .superRefine((raw, ctx) => {
      const v = raw.trim();
      const message = !v
        ? `Nhập ${label.toLowerCase()}`
        : !/^-?\d+$/.test(v)
          ? `${label} là số nguyên`
          : Number(v) < 0 || Number(v) > max
            ? `${label} từ 0 đến ${formatInt(max)}${unit}`
            : null;
      if (message) ctx.addIssue({ code: "custom", message });
    })
    .transform((v) => Number(v.trim()));
}

function decimalField(label: string, max: number, unit: string) {
  return z
    .string()
    .superRefine((raw, ctx) => {
      const v = raw.trim().replace(",", ".");
      const message = !v
        ? `Nhập ${label.toLowerCase()}`
        : !/^-?\d+(\.\d+)?$/.test(v)
          ? `${label} phải là số`
          : !/^-?\d+(\.\d)?$/.test(v)
            ? `${label} tối đa 1 chữ số thập phân`
            : Number(v) < 0 || Number(v) > max
              ? `${label} từ 0 đến ${formatInt(max)}${unit}`
              : null;
      if (message) ctx.addIssue({ code: "custom", message });
    })
    .transform((v) => Number(v.trim().replace(",", ".")));
}

/** Same rules as the meal_entries constraints and log_meal (MealLog.md §4, MEAL-10). */
export function mealFormSchema(today: Day) {
  return z.object({
    name: z
      .string()
      .transform(cleanFoodName)
      .superRefine((v, ctx) => {
        if (v.length === 0) {
          ctx.addIssue({ code: "custom", message: "Nhập tên món" });
        } else if (v.length > FOOD_NAME_MAX) {
          ctx.addIssue({
            code: "custom",
            message: `Tên món tối đa ${FOOD_NAME_MAX} ký tự`,
          });
        }
      }),
    calories: integerField("Calo", 5000, " kcal"),
    protein: decimalField("Đạm", 500, " g"),
    sodium: integerField("Natri", 20000, " mg"),
    sugar: decimalField("Đường", 500, " g"),
    eatenOn: z
      .string()
      .refine(
        (d) => !isAfterDay(d, today),
        "Không ghi được món cho ngày sau hôm nay",
      ),
  });
}

export type MealFormOutput = z.output<ReturnType<typeof mealFormSchema>>;
