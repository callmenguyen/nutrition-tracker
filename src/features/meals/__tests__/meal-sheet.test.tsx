import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import { MealSheet, type SheetTarget } from "@/features/meals/meal-sheet";
import type {
  FoodSuggestion,
  MealEntry,
  SaveResult,
} from "@/features/meals/meals";

jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}));
jest.mock("@expo/ui/jetpack-compose", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Host: ({ children }: { children: unknown }) => children,
    DatePickerDialog: (p: object) => <View testID="date-picker" {...p} />,
  };
});
jest.mock("react-native-get-random-values", () => ({}));
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

const TODAY = "2026-11-16";
const bunNam: FoodSuggestion = {
  id: "f1",
  name: "Bún nạm",
  calories: 450,
  protein: 25,
  sodium: 1800,
  sugar: 6,
};
/** Fake suggest_foods: matches "bun" / "nam" without diacritics, like the server. */
const useSuggestions = (text: string) => ({
  data: /bun|nam/i.test(text.normalize("NFD").replace(/\p{M}/gu, ""))
    ? [bunNam]
    : [],
});

const onClose = jest.fn();
const onSave = jest.fn<(id: string, meal: object) => Promise<SaveResult>>();
const onDelete = jest.fn<(id: string) => Promise<SaveResult>>();
const alert = jest.spyOn(Alert, "alert");

beforeEach(() => {
  onClose.mockReset();
  onSave.mockReset().mockResolvedValue({ ok: true });
  onDelete.mockReset().mockResolvedValue({ ok: true });
  alert.mockReset();
});

async function open(target: SheetTarget) {
  await render(
    <MealSheet
      target={target}
      today={TODAY}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      useSuggestions={useSuggestions}
    />,
  );
}

async function type(testID: string, text: string) {
  await fireEvent.changeText(screen.getByTestId(testID), text);
}

async function fill(values: Record<string, string>) {
  for (const [field, text] of Object.entries(values))
    await type(`meal-${field}`, text);
}

/** Presses one button of the last Alert.alert call (a cancel button has no onPress). */
async function answerAlert(label: string) {
  const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
  const button = buttons.find((b) => b.text === label);
  expect(button).toBeDefined();
  // The handler updates state asynchronously (delete, close): keep it inside act.
  await act(async () => {
    await button!.onPress?.();
  });
}

const BUN_NAM = {
  name: "Bún nạm",
  calories: "450",
  protein: "25",
  sodium: "1800",
  sugar: "6",
};

describe("MealSheet: add", () => {
  it("MEAL-02: saves a new meal with a client uuid and closes", async () => {
    await open({ mode: "add", day: "2026-11-15" });
    expect(screen.getByText("Thêm món")).toBeTruthy();
    await fill({ ...BUN_NAM, protein: "25,5" });
    await fireEvent.press(screen.getByTestId("meal-save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [id, meal] = onSave.mock.calls[0];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(meal).toEqual({
      name: "Bún nạm",
      calories: 450,
      protein: 25.5,
      sodium: 1800,
      sugar: 6,
      eatenOn: "2026-11-15", // MEAL-09: the viewed day, not today
    });
  });

  it("MEAL-10: shows each field's error, keeps the typed data and does not save", async () => {
    await open({ mode: "add", day: TODAY });
    await fill({
      name: "a".repeat(101),
      calories: "12.5",
      protein: "1.25",
      sodium: "",
    });
    await fireEvent.press(screen.getByTestId("meal-save"));
    await screen.findByTestId("meal-calories-error");
    expect(screen.getByTestId("meal-name-error").props.children).toBe(
      "Tên món tối đa 100 ký tự",
    );
    expect(screen.getByTestId("meal-calories-error").props.children).toBe(
      "Calo là số nguyên",
    );
    expect(screen.getByTestId("meal-protein-error").props.children).toBe(
      "Đạm tối đa 1 chữ số thập phân",
    );
    expect(screen.getByTestId("meal-sodium-error").props.children).toBe(
      "Nhập natri",
    );
    expect(screen.getByTestId("meal-sugar-error").props.children).toBe(
      "Nhập đường",
    );
    expect(screen.getByTestId("meal-calories").props.value).toBe("12.5");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("MEAL-16/17: a failed save keeps the sheet and data; Lưu again re-sends the same id", async () => {
    onSave.mockResolvedValueOnce({
      ok: false,
      message: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    });
    await open({ mode: "add", day: TODAY });
    await fill(BUN_NAM);
    await fireEvent.press(screen.getByTestId("meal-save"));
    expect(
      (await screen.findByTestId("meal-form-error")).props.children,
    ).toMatch(/kết nối/);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("meal-name").props.value).toBe("Bún nạm");

    await fireEvent.press(screen.getByTestId("meal-save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave.mock.calls[1][0]).toBe(onSave.mock.calls[0][0]);
  });

  it("MEAL-03: picking a suggestion fills all four numbers and closes the list", async () => {
    await open({ mode: "add", day: TODAY });
    await type("meal-name", "bun");
    await fireEvent.press(screen.getByTestId("meal-suggestion-0"));
    expect(screen.getByTestId("meal-name").props.value).toBe("Bún nạm");
    expect(screen.getByTestId("meal-calories").props.value).toBe("450");
    expect(screen.getByTestId("meal-protein").props.value).toBe("25");
    expect(screen.getByTestId("meal-sodium").props.value).toBe("1800");
    expect(screen.getByTestId("meal-sugar").props.value).toBe("6");
    expect(screen.queryByTestId("meal-suggestions")).toBeNull();
  });

  it("MEAL-19: number keypads, with a decimal key only for protein and sugar", async () => {
    await open({ mode: "add", day: TODAY });
    expect(screen.getByTestId("meal-calories").props.keyboardType).toBe(
      "number-pad",
    );
    expect(screen.getByTestId("meal-sodium").props.keyboardType).toBe(
      "number-pad",
    );
    expect(screen.getByTestId("meal-protein").props.keyboardType).toBe(
      "decimal-pad",
    );
    expect(screen.getByTestId("meal-sugar").props.keyboardType).toBe(
      "decimal-pad",
    );
    // The keyboard opening on show (Modal onShow → focus) is checked on the device (TC-E2E-16).
  });

  it("MEAL-18: Back closes the suggestions first, then asks; Ở lại keeps the data", async () => {
    await open({ mode: "add", day: TODAY });
    await type("meal-name", "bun");
    expect(screen.getByTestId("meal-suggestions")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("meal-sheet-scrim"));
    expect(screen.queryByTestId("meal-suggestions")).toBeNull();
    expect(alert).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("meal-sheet-scrim"));
    expect(alert.mock.calls[0][0]).toBe("Bỏ món này?");
    await answerAlert("Ở lại");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("meal-name").props.value).toBe("bun");

    await fireEvent.press(screen.getByTestId("meal-sheet-scrim"));
    await answerAlert("Bỏ");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without asking when nothing was typed", async () => {
    await open({ mode: "add", day: TODAY });
    await fireEvent.press(screen.getByTestId("meal-sheet-scrim"));
    expect(alert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("changes the day through the picker; later days are not selectable", async () => {
    await open({ mode: "add", day: TODAY });
    await fireEvent.press(screen.getByTestId("meal-date"));
    const picker = screen.getByTestId("date-picker");
    expect(picker.props.initialDate).toBe("2026-11-16T00:00:00.000Z");
    expect(picker.props.selectableDates.end.getTime()).toBe(
      new Date(2026, 10, 16).getTime(),
    );
    await fireEvent(picker, "onDateSelected", new Date(Date.UTC(2026, 10, 1)));
    expect(screen.getByText("Ngày 01/11/2026")).toBeTruthy();
  });
});

describe("MealSheet: edit and delete", () => {
  const meal: MealEntry = {
    id: "m-1",
    name: "Cơm tấm",
    calories: 650,
    protein: 30.5,
    sodium: 1200,
    sugar: 4,
  };

  it("opens prefilled and saves under the meal's own id", async () => {
    await open({ mode: "edit", meal, day: "2026-11-14" });
    expect(screen.getByText("Sửa món")).toBeTruthy();
    expect(screen.getByTestId("meal-protein").props.value).toBe("30,5");
    await type("meal-calories", "700");
    await fireEvent.press(screen.getByTestId("meal-save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toBe("m-1");
    expect(onSave.mock.calls[0][1]).toMatchObject({
      calories: 700,
      eatenOn: "2026-11-14",
    });
  });

  it("MEAL-12: Xoá asks first; Hủy keeps the meal, Xoá deletes it", async () => {
    await open({ mode: "edit", meal, day: TODAY });
    await fireEvent.press(screen.getByTestId("meal-delete"));
    expect(alert.mock.calls[0][0]).toBe("Xoá món này?");
    await answerAlert("Hủy");
    expect(onDelete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("meal-delete"));
    await answerAlert("Xoá");
    expect(onDelete).toHaveBeenCalledWith("m-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("has no Xoá button when adding", async () => {
    await open({ mode: "add", day: TODAY });
    expect(screen.queryByTestId("meal-delete")).toBeNull();
  });
});
