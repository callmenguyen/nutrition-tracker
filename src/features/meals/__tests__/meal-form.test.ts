import { describe, expect, it } from "@jest/globals";

import {
  emptyMealForm,
  mealFormSchema,
  type MealFormValues,
  toMealFormValues,
} from "@/features/meals/meal-form";

const TODAY = "2026-11-16";
const schema = mealFormSchema(TODAY);
const valid: MealFormValues = {
  name: "Bún nạm",
  calories: "450",
  protein: "25",
  sodium: "1800",
  sugar: "6",
  eatenOn: TODAY,
};

/** The one message for a field, or undefined when the field is valid. */
function errorFor(field: keyof MealFormValues, value: string) {
  const result = schema.safeParse({ ...valid, [field]: value });
  return result.success
    ? undefined
    : result.error.issues.find((i) => i.path[0] === field)?.message;
}

describe("mealFormSchema (MealLog.md §4)", () => {
  it("parses MEAL-02's Bún nạm", () => {
    expect(schema.parse(valid)).toEqual({
      name: "Bún nạm",
      calories: 450,
      protein: 25,
      sodium: 1800,
      sugar: 6,
      eatenOn: TODAY,
    });
  });

  it("cleans the name and accepts 0 and a decimal comma", () => {
    expect(
      schema.parse({
        ...valid,
        name: "  bún   NẠM ",
        calories: "0",
        protein: "25,5",
        sugar: " 0,1 ",
      }),
    ).toMatchObject({
      name: "bún NẠM",
      calories: 0,
      protein: 25.5,
      sugar: 0.1,
    });
  });

  it("MEAL-10: rejects a blank or 101-character name", () => {
    expect(errorFor("name", "")).toBe("Nhập tên món");
    expect(errorFor("name", "   ")).toBe("Nhập tên món");
    expect(errorFor("name", "a".repeat(101))).toBe("Tên món tối đa 100 ký tự");
    expect(errorFor("name", "a".repeat(100))).toBeUndefined();
  });

  it("MEAL-10: calories must be a whole number from 0 to 5000", () => {
    expect(errorFor("calories", "-1")).toBe("Calo từ 0 đến 5.000 kcal");
    expect(errorFor("calories", "5001")).toBe("Calo từ 0 đến 5.000 kcal");
    expect(errorFor("calories", "12.5")).toBe("Calo là số nguyên");
    expect(errorFor("calories", "12,5")).toBe("Calo là số nguyên");
    expect(errorFor("calories", "")).toBe("Nhập calo");
    expect(errorFor("calories", "5000")).toBeUndefined();
  });

  it("MEAL-10: protein and sugar allow at most one decimal, 0 to 500 g", () => {
    expect(errorFor("protein", "1.25")).toBe("Đạm tối đa 1 chữ số thập phân");
    expect(errorFor("protein", "1,25")).toBe("Đạm tối đa 1 chữ số thập phân");
    expect(errorFor("protein", "500.1")).toBe("Đạm từ 0 đến 500 g");
    expect(errorFor("protein", "abc")).toBe("Đạm phải là số");
    expect(errorFor("sugar", "")).toBe("Nhập đường");
    expect(errorFor("sugar", "-0.1")).toBe("Đường từ 0 đến 500 g");
    expect(errorFor("sugar", "499,9")).toBeUndefined();
  });

  it("MEAL-10: sodium is a whole number from 0 to 20000 mg", () => {
    expect(errorFor("sodium", "20001")).toBe("Natri từ 0 đến 20.000 mg");
    expect(errorFor("sodium", "1.5")).toBe("Natri là số nguyên");
    expect(errorFor("sodium", "")).toBe("Nhập natri");
  });

  it("blocks days after today (§4), allows any earlier day", () => {
    expect(errorFor("eatenOn", "2026-11-17")).toBe(
      "Không ghi được món cho ngày sau hôm nay",
    );
    expect(errorFor("eatenOn", "2020-01-01")).toBeUndefined();
  });

  it("reports every invalid field at once", () => {
    const result = schema.safeParse({
      ...emptyMealForm(TODAY),
      calories: "12.5",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path[0]).sort()).toEqual(
      ["calories", "name", "protein", "sodium", "sugar"].sort(),
    );
  });
});

describe("toMealFormValues", () => {
  it("writes numbers as input text: no thousands dots, decimal comma", () => {
    expect(
      toMealFormValues(
        {
          name: "Cơm tấm",
          calories: 650,
          protein: 30.5,
          sodium: 1200,
          sugar: 4,
        },
        "2026-11-15",
      ),
    ).toEqual({
      name: "Cơm tấm",
      calories: "650",
      protein: "30,5",
      sodium: "1200",
      sugar: "4",
      eatenOn: "2026-11-15",
    });
  });
});
