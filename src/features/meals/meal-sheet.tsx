import { DatePickerDialog, Host } from "@expo/ui/jetpack-compose";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type Ref,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  useEffect,
} from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextInput,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, FormError, TextField } from "@/components/form";
import { ThemedText } from "@/components/themed-text";
import { layout, space } from "@/constants/theme";
import {
  type Day,
  formatDayVi,
  fromPickerDate,
  isAfterDay,
  localDateOf,
  toPickerDateIso,
} from "@/domain/day";
import { formatInt } from "@/domain/format";
import {
  emptyMealForm,
  type MealFormOutput,
  type MealFormValues,
  mealFormSchema,
  toMealFormValues,
} from "@/features/meals/meal-form";
import {
  type FoodSuggestion,
  type MealEntry,
  type SaveResult,
  useFoodSuggestions,
} from "@/features/meals/meals";
import { useTheme } from "@/hooks/use-theme";
import { uuidV4 } from "@/lib/uuid";

export type SheetTarget =
  { mode: "add"; day: Day } | { mode: "edit"; meal: MealEntry; day: Day };

type Props = {
  target: SheetTarget | null;
  today: Day;
  onClose: () => void;
  onSave: (id: string, meal: MealFormOutput) => Promise<SaveResult>;
  onDelete: (id: string) => Promise<SaveResult>;
  /** Injected for tests; the app uses the suggest_foods query. */
  useSuggestions?: (text: string) => { data?: FoodSuggestion[] };
};

/**
 * Bottom sheet to add, edit or delete a meal (MealLog.md §2–3, brief "Bottom sheet ghi món").
 * Android Back closes the keyboard first (the IME takes it), then the suggestions, then asks
 * "Bỏ món này?" when something is unsaved (MEAL-18, MEAL-19).
 */
export function MealSheet({ target, ...rest }: Props) {
  const { colors } = useTheme();
  const key = target
    ? target.mode === "edit"
      ? `edit-${target.meal.id}`
      : `add-${target.day}`
    : "closed";
  const body = useRef<SheetHandle>(null);
  const requestClose = () => body.current?.requestClose();
  return (
    <Modal
      visible={target !== null}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      // autoFocus inside a Modal runs before its window has focus on Android, so the field is
      // focused without the keyboard. Focusing once the Modal is shown opens the keyboard (brief).
      // The dialog window gets input focus a moment after onShow (seen on MIUI), so wait briefly.
      onShow={() => {
        setTimeout(() => body.current?.focusName(), 250);
      }}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          style={[
            styles.flex,
            { backgroundColor: colors.onSurface },
            styles.scrim,
          ]}
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel="Đóng"
          testID="meal-sheet-scrim"
        />
        {target ? (
          <SheetBody key={key} target={target} ref={body} {...rest} />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

type SheetHandle = { requestClose: () => void; focusName: () => void };

function SheetBody({
  target,
  today,
  onClose,
  onSave,
  onDelete,
  ref,
  useSuggestions = useFoodSuggestions,
}: Omit<Props, "target"> & { target: SheetTarget; ref: Ref<SheetHandle> }) {
  const { colors } = useTheme();
  const editing = target.mode === "edit";
  // One id per sheet: pressing "Lưu" again after an error re-sends the same meal (MEAL-17).
  const [id] = useState(() => (editing ? target.meal.id : uuidV4()));
  const schema = useMemo(() => mealFormSchema(today), [today]);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const pickerEnd = useMemo(() => localDateOf(today), [today]);

  const {
    control,
    handleSubmit,
    setValue,
    trigger,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<MealFormValues, unknown, MealFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? toMealFormValues(target.meal, target.day)
      : emptyMealForm(target.day),
    mode: "all",
  });
  const name = useWatch({ control, name: "name" });
  const eatenOn = useWatch({ control, name: "eatenOn" });
  const suggestions = (useSuggestions(name).data ?? []).slice(0, 5);
  const showSuggestions = suggestOpen && suggestions.length > 0;

  // Back or a tap on the scrim: close suggestions first, then ask before dropping typed data.
  const nameInput = useRef<ComponentRef<typeof TextInput>>(null);
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardOpen(true),
    );
    const hidden = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardOpen(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  useImperativeHandle(ref, () => ({
    focusName: () => {
      if (!editing) nameInput.current?.focus();
    },
    requestClose: () => {
      // A save or delete in flight finishes first: the sheet stays open until it does (brief).
      if (isSubmitting || deleting) return;
      if (showSuggestions) {
        setSuggestOpen(false);
      } else if (isDirty) {
        Alert.alert("Bỏ món này?", "Món chưa được lưu.", [
          { text: "Ở lại", style: "cancel" },
          { text: "Bỏ", style: "destructive", onPress: onClose },
        ]);
      } else {
        onClose();
      }
    },
  }));

  const pick = (food: FoodSuggestion) => {
    const filled = toMealFormValues(food, eatenOn);
    for (const field of [
      "name",
      "calories",
      "protein",
      "sodium",
      "sugar",
    ] as const) {
      setValue(field, filled[field], { shouldDirty: true });
    }
    setSuggestOpen(false);
    void trigger();
  };

  const save = handleSubmit(async (values) => {
    setFormError(null);
    const result = await onSave(id, values);
    // On failure the sheet and the typed data stay; nothing shows as saved (MEAL-16).
    if (result.ok) onClose();
    else setFormError(result.message);
  });

  const confirmDelete = () =>
    Alert.alert("Xoá món này?", "Món sẽ mất khỏi ngày này.", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          setFormError(null);
          setDeleting(true);
          const result = await onDelete(id);
          setDeleting(false);
          if (result.ok) onClose();
          else setFormError(result.message);
        },
      },
    ]);

  const numberField = (
    field: "calories" | "protein" | "sodium" | "sugar",
    label: string,
    decimal: boolean,
  ) => (
    <View style={styles.half}>
      <Controller
        control={control}
        name={field}
        render={({ field: f }) => (
          <TextField
            label={label}
            value={f.value}
            onChangeText={f.onChange}
            onBlur={f.onBlur}
            error={errors[field]?.message}
            // MEAL-19: number keypad; a decimal key only where one decimal is allowed.
            keyboardType={decimal ? "decimal-pad" : "number-pad"}
            testID={`meal-${field}`}
          />
        )}
      />
    </View>
  );

  return (
    <View
      style={[styles.sheet, { backgroundColor: colors.background }]}
      testID="meal-sheet"
    >
      <View
        style={[styles.handle, { backgroundColor: colors.outline }]}
        importantForAccessibility="no"
      />
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.body}>
        <ThemedText variant="headline" accessibilityRole="header">
          {editing ? "Sửa món" : "Thêm món"}
        </ThemedText>

        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <TextField
              label="Tên món"
              value={field.value}
              onChangeText={(text) => {
                field.onChange(text);
                setSuggestOpen(true);
              }}
              onBlur={field.onBlur}
              error={errors.name?.message}
              ref={nameInput}
              autoCapitalize="sentences"
              maxLength={200}
              testID="meal-name"
            />
          )}
        />
        {showSuggestions ? (
          <View
            style={[styles.suggestions, { borderColor: colors.outlineVariant }]}
            testID="meal-suggestions"
          >
            {suggestions.map((food, i) => (
              <Pressable
                key={food.id}
                onPress={() => pick(food)}
                accessibilityRole="button"
                accessibilityLabel={`${food.name}, ${formatInt(food.calories)} kcal`}
                style={styles.suggestion}
                testID={`meal-suggestion-${i}`}
              >
                <ThemedText
                  variant="body"
                  numberOfLines={1}
                  style={styles.flex}
                >
                  {food.name}
                </ThemedText>
                <ThemedText variant="body" color="onSurfaceVariant" numeric>
                  {`${formatInt(food.calories)} kcal`}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.grid}>
          {numberField("calories", "Calo (kcal)", false)}
          {numberField("protein", "Đạm (g)", true)}
          {numberField("sodium", "Natri (mg)", false)}
          {numberField("sugar", "Đường (g)", true)}
        </View>

        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`Ngày ăn, ${formatDayVi(eatenOn)}`}
          style={[styles.chip, { borderColor: colors.outline }]}
          testID="meal-date"
        >
          <ThemedText variant="label" numeric>
            {`Ngày ${formatDayVi(eatenOn)}`}
          </ThemedText>
        </Pressable>
        {errors.eatenOn ? (
          <ThemedText
            variant="bodySmall"
            color="error"
            testID="meal-date-error"
          >
            {errors.eatenOn.message}
          </ThemedText>
        ) : null}
        {picking ? (
          <Host matchContents>
            <DatePickerDialog
              initialDate={toPickerDateIso(eatenOn)}
              selectableDates={{ end: pickerEnd }}
              confirmButtonLabel="Chọn"
              dismissButtonLabel="Hủy"
              showVariantToggle={false}
              showTitle={false}
              color={colors.primary}
              onDateSelected={(date) => {
                setPicking(false);
                const picked = fromPickerDate(date);
                if (!isAfterDay(picked, today)) {
                  setValue("eatenOn", picked, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }
              }}
              onDismissRequest={() => setPicking(false)}
            />
          </Host>
        ) : null}

        {formError ? (
          <FormError message={formError} testID="meal-form-error" />
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.actions,
          // Above the keyboard (KeyboardAvoidingView) and clear of a 3-button navigation bar.
          { paddingBottom: keyboardOpen ? space.s : space.l + insets.bottom },
        ]}
      >
        {editing ? (
          <Button
            label="Xoá"
            variant="text"
            onPress={confirmDelete}
            disabled={isSubmitting}
            loading={deleting}
            testID="meal-delete"
          />
        ) : (
          <View />
        )}
        <Button
          label="Lưu"
          onPress={save}
          loading={isSubmitting}
          // A save racing a delete would re-insert the deleted meal under the same id.
          disabled={deleting}
          testID="meal-save"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { opacity: 0.32 },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: space.l,
  },
  // Shrinks so the footer with "Lưu" stays visible above the keyboard (≤ 3 taps, brief).
  body: { flexShrink: 1 },
  handle: {
    alignSelf: "center",
    width: 32,
    height: 4,
    borderRadius: 2,
    marginVertical: space.m,
    opacity: 0.6,
  },
  suggestions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginTop: space.xs,
  },
  suggestion: {
    minHeight: layout.touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.m,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: space.m },
  half: { flexBasis: "45%", flexGrow: 1 },
  chip: {
    alignSelf: "flex-start",
    minHeight: layout.touchTarget,
    justifyContent: "center",
    paddingHorizontal: space.m,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: space.m,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: space.m,
  },
});
