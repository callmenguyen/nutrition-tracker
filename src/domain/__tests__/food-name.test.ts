import { describe, expect, it } from "@jest/globals";

import {
  cleanFoodName,
  filterFoodsByName,
  isValidFoodName,
  normalizeFoodName,
} from "@/domain/food-name";

describe("food-name (mirrors public.normalize_food_name)", () => {
  it.each([
    ["  Bún  NẠM ", "bun nam"],
    ["Đậu phụ", "dau phu"],
    ["Cà phê sữa đá", "ca phe sua da"],
    ["Bún nạm", "bun nam"],
    ["\tbun\nnam ", "bun nam"], // tabs and newlines
    ["Bún nạm", "bun nam"], // decomposed input (NFD)
  ])("normalize(%j) = %j", (input, expected) => {
    expect(normalizeFoodName(input)).toBe(expected);
  });

  it("cleanFoodName keeps case and diacritics, collapses spaces (MEAL-06)", () => {
    expect(cleanFoodName("bún  NẠM ")).toBe("bún NẠM");
  });

  it("validates 1–100 characters after cleaning (MEAL-10)", () => {
    expect(isValidFoodName("   ")).toBe(false);
    expect(isValidFoodName("a".repeat(100))).toBe(true);
    expect(isValidFoodName("a".repeat(101))).toBe(false);
  });
});

describe("filterFoodsByName (Cài đặt › Món đã lưu search)", () => {
  const foods = [
    { name: "Bún nạm" },
    { name: "Đậu phụ" },
    { name: "Cơm tấm" },
    { name: "Bánh bún chả" },
  ];

  it("keeps every food for empty or blank text", () => {
    expect(filterFoodsByName(foods, "")).toEqual(foods);
    expect(filterFoodsByName(foods, "   ")).toEqual(foods);
  });

  it("matches anywhere in the name, ignoring case and diacritics, keeping order", () => {
    expect(filterFoodsByName(foods, "BUN").map((f) => f.name)).toEqual([
      "Bún nạm",
      "Bánh bún chả",
    ]);
    expect(filterFoodsByName(foods, "dau").map((f) => f.name)).toEqual([
      "Đậu phụ",
    ]);
    expect(filterFoodsByName(foods, "  tấm ").map((f) => f.name)).toEqual([
      "Cơm tấm",
    ]);
  });

  it("returns nothing when no name contains the text", () => {
    expect(filterFoodsByName(foods, "phở")).toEqual([]);
  });
});
