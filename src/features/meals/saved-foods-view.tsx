import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { Button, FormError, TextField } from "@/components/form";
import { FormScreen } from "@/components/form-screen";
import { ThemedText } from "@/components/themed-text";
import { filterFoodsByName } from "@/domain/food-name";
import { formatInt, formatUpTo1 } from "@/domain/format";
import { layout, space } from "@/constants/theme";
import type { SaveResult, SavedFood } from "@/features/meals/meals";
import { useTheme } from "@/hooks/use-theme";

export type SavedFoodsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; foods: SavedFood[] };

type Props = {
  state: SavedFoodsState;
  onDelete: (id: string) => Promise<SaveResult>;
  onRetry: () => void;
  onBack: () => void;
};

/**
 * Cài đặt › Món đã lưu (MealLog.md §2): search by name (diacritic-insensitive), long-press a food
 * to delete it after confirming. Logged meals keep their own copies (MEAL-13).
 */
export function SavedFoodsView({ state, onDelete, onRetry, onBack }: Props) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = (food: SavedFood) => {
    if (deleting) return;
    Alert.alert(
      "Xoá món đã lưu?",
      `«${food.name}» sẽ không còn trong gợi ý. Các món đã ghi không đổi.`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xoá",
          style: "destructive",
          onPress: async () => {
            setError(null);
            setDeleting(true);
            try {
              const result = await onDelete(food.id);
              if (!result.ok) setError(result.message);
            } catch {
              setError("Không xoá được. Thử lại sau.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <FormScreen
      title="Món đã lưu"
      subtitle="Bấm giữ một món để xoá. Các món đã ghi không đổi."
      testID="screen-saved-foods"
      onBack={onBack}
    >
      {state.status === "ready" && state.foods.length > 0 ? (
        <TextField
          label="Tìm món"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          testID="saved-foods-search"
        />
      ) : null}
      <FormError message={error} testID="saved-foods-delete-error" />
      {state.status === "loading" ? (
        <Skeleton />
      ) : state.status === "error" ? (
        <View>
          <ThemedText variant="body" testID="saved-foods-error">
            Không tải được món đã lưu.
          </ThemedText>
          <View style={styles.retry}>
            <Button
              label="Thử lại"
              variant="text"
              onPress={onRetry}
              testID="saved-foods-retry"
            />
          </View>
        </View>
      ) : state.foods.length === 0 ? (
        <ThemedText
          variant="body"
          color="onSurfaceVariant"
          testID="saved-foods-empty"
        >
          Chưa có món đã lưu. Món bạn ghi sẽ tự được lưu ở đây.
        </ThemedText>
      ) : (
        <FoodList
          foods={filterFoodsByName(state.foods, query)}
          onLongPress={confirmDelete}
          disabled={deleting}
        />
      )}
    </FormScreen>
  );
}

function FoodList({
  foods,
  onLongPress,
  disabled,
}: {
  foods: SavedFood[];
  onLongPress: (food: SavedFood) => void;
  /** While a delete is running: rows are dimmed and ignore long-press. */
  disabled: boolean;
}) {
  const { colors } = useTheme();
  if (foods.length === 0) {
    return (
      <ThemedText
        variant="body"
        color="onSurfaceVariant"
        testID="saved-foods-no-match"
      >
        Không có món nào khớp
      </ThemedText>
    );
  }
  return (
    <View>
      {foods.map((food, i) => (
        <Pressable
          key={food.id}
          onLongPress={() => onLongPress(food)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          // TalkBack: deleting is a named action, not only "double-tap and hold".
          accessibilityActions={[{ name: "longpress", label: "Xoá" }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "longpress") onLongPress(food);
          }}
          accessibilityLabel={`${food.name}, ${formatInt(food.calories)} kcal, đạm ${formatUpTo1(
            food.protein,
          )} g, natri ${formatInt(food.sodium)} mg, đường ${formatUpTo1(food.sugar)} g`}
          accessibilityHint="Bấm giữ để xoá"
          style={({ pressed }) => [
            styles.row,
            { borderColor: colors.outlineVariant },
            pressed && { backgroundColor: colors.surfaceContainer },
            disabled && styles.disabled,
          ]}
          testID={`saved-food-row-${i}`}
        >
          <View style={styles.line}>
            <ThemedText
              variant="body"
              numberOfLines={2}
              style={styles.name}
              testID={`saved-food-row-${i}-name`}
            >
              {food.name}
            </ThemedText>
            <ThemedText variant="body" numeric>
              {`${formatInt(food.calories)} kcal`}
            </ThemedText>
          </View>
          <ThemedText variant="bodySmall" color="onSurfaceVariant" numeric>
            {`Đạm ${formatUpTo1(food.protein)} g · Natri ${formatInt(
              food.sodium,
            )} mg · Đường ${formatUpTo1(food.sugar)} g`}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

function Skeleton() {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Đang tải"
      accessibilityState={{ busy: true }}
      testID="saved-foods-loading"
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.skeleton,
            { backgroundColor: colors.surfaceContainer },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.touchTarget,
    paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  line: { flexDirection: "row", alignItems: "flex-start" },
  name: { flex: 1, paddingRight: space.s },
  disabled: { opacity: 0.38 },
  skeleton: { height: 48, borderRadius: 4, marginTop: space.s },
  // The text button's 12 dp padding would push its label off the content edge.
  retry: { alignSelf: "flex-start", marginTop: space.s, marginLeft: -12 },
});
