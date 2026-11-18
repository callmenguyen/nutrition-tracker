import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import type { SaveResult, SavedFood } from "@/features/meals/meals";
import {
  SavedFoodsView,
  type SavedFoodsState,
} from "@/features/meals/saved-foods-view";

jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaView: View };
});
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

const food = (id: string, name: string, calories = 450): SavedFood => ({
  id,
  name,
  calories,
  protein: 25,
  sodium: 1800,
  sugar: 6.5,
});
const FOODS = [
  food("f1", "Bánh bún chả", 520),
  food("f2", "Bún nạm"),
  food("f3", "Đậu phụ", 120),
];

const onDelete = jest.fn<(id: string) => Promise<SaveResult>>();
const onRetry = jest.fn();
const alert = jest.spyOn(Alert, "alert");

beforeEach(() => {
  onDelete.mockReset().mockResolvedValue({ ok: true });
  onRetry.mockReset();
  alert.mockReset();
});

async function show(state: SavedFoodsState) {
  await render(
    <SavedFoodsView
      state={state}
      onDelete={onDelete}
      onRetry={onRetry}
      onBack={() => {}}
    />,
  );
}

const names = () =>
  screen
    .queryAllByTestId(/^saved-food-row-\d+-name$/)
    .map((n) => n.props.children);

async function answerAlert(label: string) {
  const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
  const button = buttons.find((b) => b.text === label);
  expect(button).toBeDefined();
  await act(async () => {
    await button!.onPress?.();
  });
}

describe("SavedFoodsView (Cài đặt › Món đã lưu)", () => {
  it("lists saved foods with kcal and the nutrient line", async () => {
    await show({ status: "ready", foods: FOODS });
    expect(names()).toEqual(["Bánh bún chả", "Bún nạm", "Đậu phụ"]);
    expect(screen.getByText("450 kcal")).toBeTruthy();
    expect(
      screen.getAllByText("Đạm 25 g · Natri 1.800 mg · Đường 6,5 g"),
    ).toHaveLength(3);
  });

  it("searches without diacritics or case", async () => {
    await show({ status: "ready", foods: FOODS });
    await fireEvent.changeText(screen.getByTestId("saved-foods-search"), "BUN");
    expect(names()).toEqual(["Bánh bún chả", "Bún nạm"]);
    await fireEvent.changeText(screen.getByTestId("saved-foods-search"), "dau");
    expect(names()).toEqual(["Đậu phụ"]);
  });

  it("says so when nothing matches", async () => {
    await show({ status: "ready", foods: FOODS });
    await fireEvent.changeText(screen.getByTestId("saved-foods-search"), "phở");
    expect(names()).toEqual([]);
    expect(screen.getByTestId("saved-foods-no-match")).toBeTruthy();
  });

  it("MEAL-13: long-press asks first; Hủy deletes nothing, Xoá deletes that food", async () => {
    await show({ status: "ready", foods: FOODS });
    await fireEvent(screen.getByTestId("saved-food-row-1"), "longPress");
    expect(alert.mock.calls.at(-1)![0]).toBe("Xoá món đã lưu?");
    await answerAlert("Hủy");
    expect(onDelete).not.toHaveBeenCalled();

    await fireEvent(screen.getByTestId("saved-food-row-1"), "longPress");
    await answerAlert("Xoá");
    expect(onDelete).toHaveBeenCalledWith("f2");
  });

  it("shows why a delete failed", async () => {
    onDelete.mockResolvedValue({
      ok: false,
      message: "Không xoá được. Thử lại sau.",
    });
    await show({ status: "ready", foods: FOODS });
    await fireEvent(screen.getByTestId("saved-food-row-0"), "longPress");
    await answerAlert("Xoá");
    expect(screen.getByTestId("saved-foods-delete-error").props.children).toBe(
      "Không xoá được. Thử lại sau.",
    );
  });

  it("empty, loading and error states", async () => {
    await show({ status: "ready", foods: [] });
    expect(screen.getByTestId("saved-foods-empty")).toBeTruthy();

    await show({ status: "loading" });
    expect(screen.getByTestId("saved-foods-loading")).toBeTruthy();

    await show({ status: "error" });
    expect(screen.getByTestId("saved-foods-error")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("saved-foods-retry"));
    expect(onRetry).toHaveBeenCalled();
  });
});
