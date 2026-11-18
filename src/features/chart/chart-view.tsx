import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChoiceGroup } from "@/components/choice-group";
import { Button } from "@/components/form";
import { MarginRow, NotebookPage } from "@/components/notebook";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { layout, space } from "@/constants/theme";
import {
  buildSeries,
  type ChartKind,
  type ChartPrefs,
  chartThresholds,
  type DailyTotal,
  type Metric,
  type Threshold,
  totalsOn,
  yDomain,
} from "@/domain/chart";
import { type Day, formatDayVi } from "@/domain/day";
import { formatInt, formatUpTo1 } from "@/domain/format";
import type { Targets } from "@/domain/nutrition";
import { ChartCanvas } from "@/features/chart/chart-canvas";
import { useTheme } from "@/hooks/use-theme";

export type ChartState =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | { kind: "ready"; totals: DailyTotal[]; targets: Targets };

type Props = {
  today: Day;
  prefs: ChartPrefs;
  onChangePrefs: (change: Partial<ChartPrefs>) => void;
  state: ChartState;
  /** "Mở ngày này": show that day on Hôm nay (CHART-07). */
  onOpenDay: (day: Day) => void;
};

const METRICS: Record<Metric, { label: string; unit: string }> = {
  calories: { label: "Calo", unit: "kcal" },
  protein: { label: "Đạm", unit: "g" },
  sodium: { label: "Natri", unit: "mg" },
  sugar: { label: "Đường", unit: "g" },
};
const METRIC_ORDER: Metric[] = ["calories", "protein", "sodium", "sugar"];

/** "1.500 kcal", "28,5 g": whole numbers for kcal and mg, one decimal for grams. */
function formatValue(metric: Metric, value: number): string {
  const { unit } = METRICS[metric];
  return `${unit === "g" ? formatUpTo1(value) : formatInt(value)} ${unit}`;
}

/**
 * Tab Biểu đồ (Chart.md §2–3): metric, range and kind pickers, the chart with threshold lines,
 * legend, the selected day's card and a table view for screen readers (CHART-14). Presentational.
 */
export function ChartView({
  today,
  prefs,
  onChangePrefs,
  state,
  onOpenDay,
}: Props) {
  return (
    <ThemedView style={styles.flex} testID="screen-chart">
      <SafeAreaView edges={["top"]} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} testID="chart-scroll">
          <NotebookPage style={styles.page}>
            <MarginRow>
              <ThemedText variant="headline" accessibilityRole="header">
                Biểu đồ
              </ThemedText>
            </MarginRow>
            <MarginRow style={styles.pickers}>
              <ChoiceGroup
                label="Chỉ số"
                options={METRIC_ORDER.map((m) => ({
                  value: m,
                  label: METRICS[m].label,
                }))}
                value={prefs.metric}
                onChange={(metric) => onChangePrefs({ metric })}
                testID="chart-metric"
              />
              <ChoiceGroup
                label="Khoảng"
                options={[
                  { value: "7", label: "7 ngày" },
                  { value: "30", label: "30 ngày" },
                ]}
                value={String(prefs.range) as "7" | "30"}
                onChange={(r) => onChangePrefs({ range: r === "30" ? 30 : 7 })}
                testID="chart-range"
              />
              <ChoiceGroup<ChartKind>
                label="Dạng"
                options={[
                  { value: "line", label: "Đường" },
                  { value: "bar", label: "Cột" },
                ]}
                value={prefs.kind}
                onChange={(kind) => onChangePrefs({ kind })}
                testID="chart-kind"
              />
            </MarginRow>
            {state.kind === "loading" ? (
              <Loading />
            ) : state.kind === "error" ? (
              <LoadError onRetry={state.onRetry} />
            ) : (
              <ChartContent
                today={today}
                prefs={prefs}
                totals={state.totals}
                targets={state.targets}
                onOpenDay={onOpenDay}
              />
            )}
          </NotebookPage>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ChartContent({
  today,
  prefs,
  totals,
  targets,
  onOpenDay,
}: {
  today: Day;
  prefs: ChartPrefs;
  totals: DailyTotal[];
  targets: Targets;
  onOpenDay: (day: Day) => void;
}) {
  const { nutrients } = useTheme();
  const [selected, setSelected] = useState<Day | null>(null);
  const [showTable, setShowTable] = useState(false);
  const { metric, range, kind } = prefs;
  const series = buildSeries(totals, today, range, metric);
  const thresholds = chartThresholds(targets, metric);
  const empty = series.every((p) => p.value === null);
  // A day picked in the 30-day range is dropped when switching to 7 days.
  const selectedDay = series.some((p) => p.day === selected) ? selected : null;
  const { label } = METRICS[metric];

  return (
    <>
      <MarginRow style={styles.block}>
        {empty ? (
          <ThemedText
            variant="body"
            color="onSurfaceVariant"
            testID="chart-empty"
          >
            Chưa có dữ liệu trong khoảng này
          </ThemedText>
        ) : null}
        <ChartCanvas
          series={series}
          thresholds={thresholds}
          domain={yDomain(series, thresholds)}
          kind={kind}
          color={nutrients[metric]}
          selectedDay={selectedDay}
          onSelectDay={setSelected}
          accessibilityLabel={`Biểu đồ ${label} ${range} ngày. Mở dạng bảng để nghe giá trị từng ngày.`}
        />
        <Legend metric={metric} thresholds={thresholds} />
      </MarginRow>
      {selectedDay ? (
        <DayCard
          day={selectedDay}
          totals={totalsOn(totals, selectedDay)}
          onOpenDay={onOpenDay}
        />
      ) : null}
      <MarginRow style={styles.block}>
        <View style={styles.textButton}>
          <Button
            label={showTable ? "Ẩn bảng" : "Xem dạng bảng"}
            variant="text"
            onPress={() => setShowTable((v) => !v)}
            testID="chart-table-toggle"
          />
        </View>
        {showTable ? (
          <View accessibilityLabel={`Bảng ${label} theo ngày`}>
            {series.map((p, i) => {
              const text =
                p.value === null ? "Chưa ghi" : formatValue(metric, p.value);
              return (
                <TableRow
                  key={p.day}
                  label={p.label}
                  text={text}
                  selected={p.day === selectedDay}
                  onPress={() => setSelected(p.day)}
                  testID={`chart-row-${i}`}
                />
              );
            })}
          </View>
        ) : null}
      </MarginRow>
    </>
  );
}

function Legend({
  metric,
  thresholds,
}: {
  metric: Metric;
  thresholds: Threshold[];
}) {
  const { colors, nutrients } = useTheme();
  const lineColor = (l: Threshold) =>
    l.kind === "upper"
      ? colors.error
      : l.kind === "target"
        ? colors.goal
        : colors.outline;
  const { label, unit } = METRICS[metric];
  return (
    <View style={styles.legend} testID="chart-legend">
      <LegendItem
        swatch={
          <View
            style={[styles.swatch, { backgroundColor: nutrients[metric] }]}
          />
        }
        text={`${label} (${unit})`}
      />
      {thresholds.map((l) => (
        <LegendItem
          key={l.kind}
          swatch={
            <View
              style={[
                styles.dash,
                { borderColor: lineColor(l) },
                l.kind === "bmr" || l.kind === "lower"
                  ? styles.dotted
                  : styles.dashed,
              ]}
            />
          }
          text={`${l.label} ${formatValue(metric, l.value)}`}
        />
      ))}
    </View>
  );
}

function LegendItem({ swatch, text }: { swatch: ReactNode; text: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <ThemedText variant="bodySmall" color="onSurfaceVariant">
        {text}
      </ThemedText>
    </View>
  );
}

function DayCard({
  day,
  totals,
  onOpenDay,
}: {
  day: Day;
  totals: DailyTotal | null;
  onOpenDay: (day: Day) => void;
}) {
  const { colors } = useTheme();
  return (
    <MarginRow style={styles.block}>
      <View
        style={[styles.card, { backgroundColor: colors.surfaceContainer }]}
        testID="chart-detail"
      >
        <ThemedText variant="titleMedium" testID="chart-detail-day">
          {formatDayVi(day)}
        </ThemedText>
        {totals ? (
          METRIC_ORDER.map((m) => (
            <ThemedText
              key={m}
              variant="body"
              numeric
              testID={`chart-detail-${m}`}
            >
              {`${METRICS[m].label} ${formatValue(m, totals[m])}`}
            </ThemedText>
          ))
        ) : (
          <ThemedText
            variant="body"
            color="onSurfaceVariant"
            testID="chart-detail-none"
          >
            Chưa ghi
          </ThemedText>
        )}
        <View style={styles.textButton}>
          <Button
            label="Mở ngày này"
            variant="text"
            onPress={() => onOpenDay(day)}
            testID="chart-open-day"
          />
        </View>
      </View>
    </MarginRow>
  );
}

function TableRow({
  label,
  text,
  selected,
  onPress,
  testID,
}: {
  label: string;
  text: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${text}`}
      accessibilityHint="Xem chi tiết ngày này"
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.outlineVariant },
        (pressed || selected) && { backgroundColor: colors.surfaceContainer },
      ]}
      testID={testID}
    >
      <ThemedText variant="body" numeric>
        {label}
      </ThemedText>
      <ThemedText
        variant="body"
        numeric
        color={text === "Chưa ghi" ? "onSurfaceVariant" : "onSurface"}
        testID={`${testID}-value`}
      >
        {text}
      </ThemedText>
    </Pressable>
  );
}

function Loading() {
  const { colors } = useTheme();
  return (
    <MarginRow style={styles.block}>
      <View
        accessible
        accessibilityLabel="Đang tải"
        accessibilityState={{ busy: true }}
        style={[styles.skeleton, { backgroundColor: colors.surfaceContainer }]}
        testID="chart-loading"
      />
    </MarginRow>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <MarginRow mark="alert" markLabel="Lỗi" style={styles.block}>
      <ThemedText variant="body" testID="chart-error">
        Không tải được dữ liệu.
      </ThemedText>
      <View style={styles.textButton}>
        <Button
          label="Thử lại"
          variant="text"
          onPress={onRetry}
          testID="chart-retry"
        />
      </View>
    </MarginRow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingTop: space.m },
  page: { paddingBottom: space.block },
  pickers: { marginTop: space.l, gap: space.m },
  block: { marginTop: space.block, gap: space.s },
  legend: { gap: space.xs, marginTop: space.s },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.s },
  swatch: { width: 16, height: 12, borderRadius: 2 },
  dash: { width: 16, height: 0, borderTopWidth: 2 },
  dashed: { borderStyle: "dashed" },
  dotted: { borderStyle: "dotted" },
  card: { borderRadius: 12, padding: space.m, gap: space.xs },
  row: {
    minHeight: layout.touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skeleton: { height: 240, borderRadius: 4 },
  // The text button's 12 dp padding would push its label off the content edge.
  textButton: { alignSelf: "flex-start", marginLeft: -12 },
});
