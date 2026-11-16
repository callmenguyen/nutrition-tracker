import { DatePickerDialog, Host } from "@expo/ui/jetpack-compose";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/form";
import { MarginRow, NotebookPage } from "@/components/notebook";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { layout, space, type Nutrient } from "@/constants/theme";
import {
  addDays,
  type Day,
  formatDayVi,
  fromPickerDate,
  isAfterDay,
  localDateOf,
  toPickerDateIso,
} from "@/domain/day";
import { formatInt, formatUpTo1 } from "@/domain/format";
import {
  calorieStatus,
  fillFraction,
  nutrientStatus,
  sumMeals,
} from "@/domain/meal-totals";
import type { NutrientTarget, Targets } from "@/domain/nutrition";
import type { MealEntry } from "@/features/meals/meals";
import { useTheme } from "@/hooks/use-theme";

export type TodayState =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | { kind: "ready"; meals: MealEntry[]; targets: Targets };

type Props = {
  day: Day;
  today: Day;
  onChangeDay: (day: Day) => void;
  state: TodayState;
  /** Opens the add-meal sheet for the viewed day (FAB "+" and the empty state's "Thêm món"). */
  onAdd: () => void;
  /** Opens the sheet to edit or delete a meal (tap on its row). */
  onEdit: (meal: MealEntry) => void;
};

/**
 * Tab Hôm nay (MealLog.md §2, brief .impeccable/surfaces/src-app-tabs-index-tsx.md): day bar,
 * Calo block, three nutrient rows and the day's meals on a notebook page. Presentational only.
 */
export function TodayView({
  day,
  today,
  onChangeDay,
  state,
  onAdd,
  onEdit,
}: Props) {
  const { colors } = useTheme();
  return (
    <ThemedView style={styles.flex} testID="screen-today">
      <SafeAreaView edges={["top"]} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <NotebookPage style={styles.page}>
            <DayBar day={day} today={today} onChangeDay={onChangeDay} />
            {state.kind === "loading" ? (
              <Skeleton />
            ) : state.kind === "error" ? (
              <LoadError onRetry={state.onRetry} />
            ) : (
              <DayContent
                meals={state.meals}
                targets={state.targets}
                onAdd={onAdd}
                onEdit={onEdit}
              />
            )}
          </NotebookPage>
        </ScrollView>
        {state.kind === "ready" ? (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel="Thêm món"
            style={({ pressed }) => [
              styles.fab,
              { backgroundColor: colors.primaryContainer },
              pressed && styles.pressed,
            ]}
            testID="today-add"
          >
            <SymbolView
              name={{ ios: "plus", android: "add", web: "add" }}
              tintColor={colors.onPrimaryContainer}
              size={24}
            />
          </Pressable>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

// ------------------------------------------------------------------ day bar
function DayBar({
  day,
  today,
  onChangeDay,
}: {
  day: Day;
  today: Day;
  onChangeDay: (day: Day) => void;
}) {
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  const atToday = !isAfterDay(today, day);
  // From the same `today` as "›", and stable across renders: a new Date each render would rebuild
  // the native picker state and drop a selection in progress.
  const pickerEnd = useMemo(() => localDateOf(today), [today]);
  const label = formatDayVi(day);

  return (
    <MarginRow style={styles.dayBar}>
      <View style={styles.dayRow}>
        <IconButton
          icon="chevron_left"
          label="Ngày trước"
          onPress={() => onChangeDay(addDays(day, -1))}
          testID="today-prev"
          style={styles.firstIcon}
        />
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`Chọn ngày, đang xem ${label}`}
          style={styles.dateButton}
          testID="today-date"
        >
          <ThemedText variant="titleMedium" numeric>
            {label}
          </ThemedText>
        </Pressable>
        <IconButton
          icon="chevron_right"
          label="Ngày sau"
          disabled={atToday}
          onPress={() => onChangeDay(addDays(day, 1))}
          testID="today-next"
        />
        {atToday ? null : (
          <Pressable
            onPress={() => onChangeDay(today)}
            accessibilityRole="button"
            accessibilityLabel="Về hôm nay"
            style={[styles.chip, { borderColor: colors.outline }]}
            testID="today-chip-today"
          >
            <ThemedText variant="label" color="onSurfaceVariant">
              Hôm nay
            </ThemedText>
          </Pressable>
        )}
      </View>
      {picking ? (
        <Host matchContents>
          <DatePickerDialog
            initialDate={toPickerDateIso(day)}
            // Local Date: @expo/ui maps it to the device's calendar day, so later days are disabled.
            selectableDates={{ end: pickerEnd }}
            confirmButtonLabel="Chọn"
            dismissButtonLabel="Hủy"
            showVariantToggle={false}
            // Its built-in title is English only ("Select date"); the headline shows the date.
            showTitle={false}
            color={colors.primary}
            onDateSelected={(date) => {
              setPicking(false);
              const picked = fromPickerDate(date);
              if (!isAfterDay(picked, today)) onChangeDay(picked);
            }}
            onDismissRequest={() => setPicking(false)}
          />
        </Host>
      ) : null}
    </MarginRow>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  testID,
  style,
}: {
  style?: ViewStyle;
  icon: "chevron_left" | "chevron_right";
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.iconButton, disabled && styles.disabled, style]}
      testID={testID}
    >
      <SymbolView
        name={{
          ios: icon === "chevron_left" ? "chevron.left" : "chevron.right",
          android: icon,
          web: icon,
        }}
        tintColor={colors.onSurface}
        size={24}
      />
    </Pressable>
  );
}

// ------------------------------------------------------------------ content
function DayContent({
  meals,
  targets,
  onAdd,
  onEdit,
}: {
  meals: MealEntry[];
  targets: Targets;
  onAdd: () => void;
  onEdit: (meal: MealEntry) => void;
}) {
  const totals = sumMeals(meals);
  return (
    <>
      <CalorieBlock total={totals.calories} targets={targets} />
      <NutrientRow
        nutrient="protein"
        label="Đạm"
        unit="g"
        total={totals.protein}
        target={targets.protein}
      />
      <NutrientRow
        nutrient="sodium"
        label="Natri"
        unit="mg"
        total={totals.sodium}
        target={targets.sodium}
      />
      <NutrientRow
        nutrient="sugar"
        label="Đường"
        unit="g"
        total={totals.sugar}
        target={targets.sugar}
      />
      <MealList meals={meals} onAdd={onAdd} onEdit={onEdit} />
    </>
  );
}

function CapacityBar({
  fraction,
  color,
  height,
}: {
  fraction: number;
  color: string;
  height: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.bar,
        { height, borderRadius: height / 2 },
        { backgroundColor: colors.surfaceContainer },
      ]}
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          width: `${fraction * 100}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function CalorieBlock({ total, targets }: { total: number; targets: Targets }) {
  const { colors, nutrients } = useTheme();
  const target = targets.calories.target;
  const status = calorieStatus(total, targets.calories);
  const flagged = status.overUpper !== null;
  const tint = flagged ? colors.error : nutrients.calories;
  const summary =
    status.kind === "over"
      ? `Vượt ${formatInt(status.amount)} kcal`
      : `Còn ${formatInt(status.amount)} kcal`;
  const rowProps = flagged
    ? ({ mark: "alert", markLabel: "Vượt ngưỡng" } as const)
    : {};

  return (
    <MarginRow
      {...rowProps}
      style={styles.block}
      accessible
      accessibilityLabel={`Calo, ${formatInt(total)} trên ${formatInt(target)} kcal, ${summary}${
        flagged ? `, vượt ngưỡng ${formatInt(status.overUpper!)} kcal` : ""
      }`}
    >
      <ThemedText variant="titleMedium" color="onSurfaceVariant">
        Calo
      </ThemedText>
      <View style={styles.valueLine}>
        <ThemedText variant="display" tint={tint} testID="today-calories">
          {formatInt(total)}
        </ThemedText>
        <ThemedText
          variant="title"
          color="onSurfaceVariant"
          numeric
          testID="today-calories-target"
        >
          {` / ${formatInt(target)} kcal`}
        </ThemedText>
      </View>
      <CapacityBar
        fraction={fillFraction(total, target)}
        color={tint}
        height={12}
      />
      <ThemedText
        variant="body"
        color="onSurfaceVariant"
        style={styles.statusLine}
        testID="today-calories-status"
      >
        {summary}
      </ThemedText>
      {flagged ? (
        <ThemedText
          variant="body"
          color="error"
          testID="today-calories-over-upper"
        >
          {`Vượt ngưỡng ${formatInt(status.overUpper!)} kcal`}
        </ThemedText>
      ) : null}
    </MarginRow>
  );
}

function NutrientRow({
  nutrient,
  label,
  unit,
  total,
  target,
}: {
  nutrient: Exclude<Nutrient, "calories">;
  label: string;
  unit: string;
  total: number;
  target: NutrientTarget;
}) {
  const { colors, nutrients } = useTheme();
  const { overUpper } = nutrientStatus(total, target);
  const flagged = overUpper !== null;
  const tint = flagged ? colors.error : nutrients[nutrient];
  const value = `${formatUpTo1(total)} / ${formatInt(target.target)} ${unit}`;
  const over = flagged ? `Vượt ngưỡng ${formatUpTo1(overUpper)} ${unit}` : "";
  const rowProps = flagged
    ? ({ mark: "alert", markLabel: "Vượt ngưỡng" } as const)
    : {};

  return (
    <MarginRow
      {...rowProps}
      style={styles.nutrient}
      firstLineHeight={28}
      accessible
      accessibilityLabel={`${label}, ${value}${over ? `, ${over}` : ""}`}
      testID={`today-${nutrient}`}
    >
      <View style={styles.nutrientLine}>
        <ThemedText variant="body" color="onSurfaceVariant">
          {label}
        </ThemedText>
        <ThemedText
          variant="title"
          tint={tint}
          numeric
          testID={`today-${nutrient}-value`}
        >
          {value}
        </ThemedText>
      </View>
      <CapacityBar
        fraction={fillFraction(total, target.target)}
        color={tint}
        height={4}
      />
      {flagged ? (
        <ThemedText
          variant="bodySmall"
          color="error"
          testID={`today-${nutrient}-over-upper`}
        >
          {over}
        </ThemedText>
      ) : null}
    </MarginRow>
  );
}

function MealList({
  meals,
  onAdd,
  onEdit,
}: {
  meals: MealEntry[];
  onAdd: () => void;
  onEdit: (meal: MealEntry) => void;
}) {
  const { colors } = useTheme();
  return (
    <>
      <MarginRow style={styles.block}>
        <ThemedText variant="titleMedium" color="onSurfaceVariant">
          Món đã ăn
        </ThemedText>
      </MarginRow>
      {meals.length === 0 ? (
        <MarginRow>
          <ThemedText
            variant="body"
            color="onSurfaceVariant"
            testID="today-empty"
          >
            Chưa có món nào cho ngày này
          </ThemedText>
          <View style={styles.retry}>
            <Button
              label="Thêm món"
              variant="text"
              onPress={onAdd}
              testID="today-empty-add"
            />
          </View>
        </MarginRow>
      ) : (
        meals.map((meal, i) => (
          <Pressable
            key={meal.id}
            onPress={() => onEdit(meal)}
            accessibilityRole="button"
            accessibilityLabel={`${meal.name}, ${formatInt(meal.calories)} kcal, đạm ${formatUpTo1(
              meal.protein,
            )} g, natri ${formatInt(meal.sodium)} mg, đường ${formatUpTo1(meal.sugar)} g`}
            accessibilityHint="Sửa hoặc xoá món"
            style={({ pressed }) =>
              pressed ? { backgroundColor: colors.surfaceContainer } : null
            }
            testID={`meal-row-${i}`}
          >
            <MarginRow
              style={[styles.mealRow, { borderColor: colors.outlineVariant }]}
            >
              <View style={styles.mealLine}>
                <ThemedText
                  variant="body"
                  numberOfLines={2}
                  style={styles.mealName}
                  testID={`meal-row-${i}-name`}
                >
                  {meal.name}
                </ThemedText>
                <ThemedText variant="body" numeric>
                  {`${formatInt(meal.calories)} kcal`}
                </ThemedText>
              </View>
              <ThemedText variant="bodySmall" color="onSurfaceVariant" numeric>
                {`Đạm ${formatUpTo1(meal.protein)} g · Natri ${formatInt(
                  meal.sodium,
                )} mg · Đường ${formatUpTo1(meal.sugar)} g`}
              </ThemedText>
            </MarginRow>
          </Pressable>
        ))
      )}
    </>
  );
}

// ------------------------------------------------------------------ states
function Skeleton() {
  const { colors } = useTheme();
  const block = (height: number, width: `${number}%`) => (
    <View
      style={[
        styles.skeleton,
        { height, width, backgroundColor: colors.surfaceContainer },
      ]}
    />
  );
  return (
    <View
      accessible
      accessibilityLabel="Đang tải"
      accessibilityState={{ busy: true }}
      testID="today-loading"
    >
      <MarginRow style={styles.block}>
        {block(20, "20%")}
        {block(44, "60%")}
        {block(12, "100%")}
      </MarginRow>
      {[0, 1, 2].map((i) => (
        <MarginRow key={i} style={styles.nutrient}>
          {block(28, "80%")}
        </MarginRow>
      ))}
      <MarginRow style={styles.block}>
        {block(48, "100%")}
        {block(48, "100%")}
      </MarginRow>
    </View>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <MarginRow mark="alert" markLabel="Lỗi" style={styles.block}>
      <ThemedText variant="body" testID="today-error">
        Không tải được dữ liệu.
      </ThemedText>
      <View style={styles.retry}>
        <Button
          label="Thử lại"
          variant="text"
          onPress={onRetry}
          testID="today-retry"
        />
      </View>
    </MarginRow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // flexGrow: the page (and its red margin rule) fills the screen even on an empty day.
  scroll: { flexGrow: 1, paddingTop: space.m },
  // Room for the FAB inside the page, so the margin rule still runs to the bottom.
  page: { paddingBottom: 96 },
  fab: {
    position: "absolute",
    right: space.m,
    bottom: space.m,
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  pressed: { opacity: 0.85 },
  dayBar: { minHeight: layout.touchTarget },
  dayRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  iconButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.38 },
  dateButton: {
    minHeight: layout.touchTarget,
    justifyContent: "center",
    paddingHorizontal: space.s,
  },
  chip: {
    minHeight: 32,
    marginLeft: space.s,
    paddingHorizontal: space.m,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
  },
  block: { marginTop: space.block },
  valueLine: { flexDirection: "row", alignItems: "baseline" },
  bar: { marginTop: space.s, overflow: "hidden" },
  statusLine: { marginTop: space.s },
  nutrient: { marginTop: space.m },
  nutrientLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  mealRow: {
    minHeight: layout.touchTarget,
    paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mealLine: { flexDirection: "row", alignItems: "flex-start" },
  mealName: { flex: 1, paddingRight: space.s },
  skeleton: { borderRadius: 4, marginTop: space.s },
  // The text button's 12 dp padding would push its label off the content edge.
  retry: { alignSelf: "flex-start", marginTop: space.s, marginLeft: -12 },
  // Same for "‹": its glyph sits 12 dp inside the 48 dp touch target.
  firstIcon: { marginLeft: -12 },
});
