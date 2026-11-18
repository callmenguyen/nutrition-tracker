import {
  Circle,
  DashPathEffect,
  Group,
  Line as SkiaLine,
  matchFont,
  Text as SkiaText,
  vec,
} from "@shopify/react-native-skia";
import { useMemo, useRef } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Bar, CartesianChart, Line } from "victory-native";

import type {
  ChartKind,
  SeriesPoint,
  Threshold,
  ThresholdKind,
} from "@/domain/chart";
import type { Day } from "@/domain/day";
import { useTheme } from "@/hooks/use-theme";

export type ChartCanvasProps = {
  series: SeriesPoint[];
  thresholds: Threshold[];
  domain: [number, number];
  kind: ChartKind;
  /** The metric's fixed hue (DESIGN.md, The Fixed Meaning Rule). */
  color: string;
  selectedDay: Day | null;
  onSelectDay: (day: Day) => void;
  /** Spoken summary; TalkBack users read the values in the table view (CHART-14). */
  accessibilityLabel: string;
};

const HEIGHT = 240;
const LABEL_SIZE = 12;
/** Dash patterns keep grey lines apart without colour (DESIGN.md, The Never Colour Alone Rule). */
const DASHES: Record<ThresholdKind, number[]> = {
  upper: [6, 4],
  target: [6, 4],
  lower: [2, 4],
  bmr: [2, 4],
  safe: [10, 4, 2, 4],
};

/**
 * Bars or a broken line for one metric over the range (ADR-009). Days without meals have no
 * bar and break the line (CHART-02); threshold lines are dashed with labels on the right edge.
 * Tapping picks the nearest day.
 */
export function ChartCanvas({
  series,
  thresholds,
  domain,
  kind,
  color,
  selectedDay,
  onSelectDay,
  accessibilityLabel,
}: ChartCanvasProps) {
  const { colors } = useTheme();
  const font = useMemo(
    () =>
      matchFont({
        fontFamily: Platform.select({
          ios: "Helvetica",
          default: "sans-serif",
        }),
        fontSize: LABEL_SIZE,
      }),
    [],
  );
  const data = useMemo(
    () => series.map((p, i) => ({ i, value: p.value })),
    [series],
  );
  const xScaleRef = useRef<((x: number) => number) | null>(null);
  const lineColor: Record<ThresholdKind, string> = {
    upper: colors.error,
    target: colors.goal,
    lower: colors.outline,
    bmr: colors.outline,
    safe: colors.outline,
  };
  const selectedIndex = series.findIndex((p) => p.day === selectedDay);
  const step = series.length > 7 ? 5 : 1;

  return (
    <Pressable
      onPress={(e) => {
        const invert = xScaleRef.current;
        if (!invert) return;
        const i = Math.round(invert(e.nativeEvent.locationX));
        const point = series[Math.min(series.length - 1, Math.max(0, i))];
        if (point) onSelectDay(point.day);
      }}
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.box}
      testID="chart-canvas"
    >
      <View style={styles.fill} pointerEvents="none">
        <CartesianChart
          data={data}
          xKey="i"
          yKeys={["value"]}
          domain={{ y: domain }}
          domainPadding={{ left: 16, right: 16 }}
          padding={{ right: 4 }}
          onScaleChange={(xScale) => {
            xScaleRef.current = (x) => xScale.invert(x);
          }}
          xAxis={{
            font,
            labelColor: colors.onSurfaceVariant,
            lineColor: colors.outlineVariant,
            tickValues: series
              .map((_, i) => i)
              .filter((i) => (series.length - 1 - i) % step === 0),
            formatXLabel: (i) => series[i]?.label ?? "",
          }}
          yAxis={[
            {
              font,
              labelColor: colors.onSurfaceVariant,
              lineColor: colors.outlineVariant,
              tickCount: 5,
            },
          ]}
        >
          {({ points, chartBounds, xScale, yScale }) => (
            <>
              {selectedIndex >= 0 ? (
                <SkiaLine
                  p1={vec(xScale(selectedIndex), chartBounds.top)}
                  p2={vec(xScale(selectedIndex), chartBounds.bottom)}
                  color={colors.outlineVariant}
                  strokeWidth={2}
                />
              ) : null}
              {kind === "bar" ? (
                <Bar
                  points={points.value}
                  chartBounds={chartBounds}
                  color={color}
                  innerPadding={0.35}
                  roundedCorners={{ topLeft: 3, topRight: 3 }}
                />
              ) : (
                <>
                  <Line
                    points={points.value}
                    color={color}
                    strokeWidth={2}
                    connectMissingData={false}
                  />
                  {/* Dots, so a day between two gaps still shows (CHART-02: "3 điểm"). */}
                  {points.value.map((p) =>
                    typeof p.y === "number" ? (
                      <Circle
                        key={p.xValue}
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        color={color}
                      />
                    ) : null,
                  )}
                </>
              )}
              {thresholds.map((l) => {
                const y = yScale(l.value);
                const width = font.measureText(l.label).width;
                return (
                  <Group key={l.kind}>
                    <SkiaLine
                      p1={vec(chartBounds.left, y)}
                      p2={vec(chartBounds.right, y)}
                      color={lineColor[l.kind]}
                      strokeWidth={1.5}
                    >
                      <DashPathEffect intervals={DASHES[l.kind]} />
                    </SkiaLine>
                    <SkiaText
                      x={chartBounds.right - width - 2}
                      y={y - 4}
                      text={l.label}
                      font={font}
                      color={lineColor[l.kind]}
                    />
                  </Group>
                );
              })}
            </>
          )}
        </CartesianChart>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { height: HEIGHT },
  fill: { flex: 1 },
});
