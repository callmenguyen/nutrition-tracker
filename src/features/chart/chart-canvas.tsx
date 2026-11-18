import {
  Circle,
  DashPathEffect,
  Line as SkiaLine,
  matchFont,
  vec,
} from "@shopify/react-native-skia";
import { useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Bar, CartesianChart, type ChartBounds, Line } from "victory-native";

import { ThemedText } from "@/components/themed-text";
import {
  type ChartKind,
  type SeriesPoint,
  spreadLabelPositions,
  type Threshold,
  type ThresholdKind,
} from "@/domain/chart";
import type { Day } from "@/domain/day";
import { formatInt } from "@/domain/format";
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

type Frame = {
  width: number;
  bounds: ChartBounds | null;
  yScale: ((v: number) => number) | null;
};

const HEIGHT = 240;
/** Axis labels: digits and dd/MM only, so Skia's system font always has the glyphs. */
const AXIS_LABEL_SIZE = 12;
/** Threshold labels may grow with the system font size up to this factor (they share the canvas). */
const LABEL_MAX_SCALE = 1.3;
/** Room for one threshold label: labelSmall line height (16) at the largest scale, plus a gap. */
const LABEL_LINE = Math.ceil(16 * LABEL_MAX_SCALE) + 2;
/** Dash patterns keep grey lines apart without colour (DESIGN.md, The Never Colour Alone Rule). */
const DASHES: Record<ThresholdKind, number[]> = {
  upper: [10, 3],
  target: [6, 4],
  lower: [2, 4],
  bmr: [2, 4],
  safe: [6, 4],
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
        fontSize: AXIS_LABEL_SIZE,
      }),
    [],
  );
  const data = useMemo(
    () => series.map((p, i) => ({ i, value: p.value })),
    [series],
  );
  const xScaleRef = useRef<((x: number) => number) | null>(null);
  // Threshold labels are React Native text over the canvas: Skia's matchFont has no fallback for
  // Vietnamese letters such as "ư" or "ụ" on some devices, while RN text always renders them.
  const [frame, setFrame] = useState<Frame>({
    width: 0,
    bounds: null,
    yScale: null,
  });
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
    // TalkBack reads one image with the summary; picking a day goes through the table view
    // (CHART-14), since a double-tap on the canvas has no meaningful position.
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={styles.box}
      testID="chart-canvas"
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        setFrame((f) => (f.width === width ? f : { ...f, width }));
      }}
    >
      <Pressable
        importantForAccessibility="no-hide-descendants"
        accessible={false}
        onPress={(e) => {
          const invert = xScaleRef.current;
          if (!invert) return;
          const i = Math.round(invert(e.nativeEvent.locationX));
          const point = series[Math.min(series.length - 1, Math.max(0, i))];
          if (point) onSelectDay(point.day);
        }}
        style={styles.fill}
      >
        <View style={styles.fill} pointerEvents="none">
          <CartesianChart
            data={data}
            xKey="i"
            yKeys={["value"]}
            domain={{ y: domain }}
            domainPadding={{ left: 16, right: 16 }}
            padding={{ right: 4 }}
            onScaleChange={(xScale, yScale) => {
              xScaleRef.current = (x) => xScale.invert(x);
              setFrame((f) => ({ ...f, yScale: (v) => yScale(v) }));
            }}
            onChartBoundsChange={(bounds) =>
              setFrame((f) => ({ ...f, bounds }))
            }
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
                formatYLabel: (v) => formatInt(Number(v)), // "4.000" (CLAUDE.md number style)
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
                  return (
                    <SkiaLine
                      key={l.kind}
                      p1={vec(chartBounds.left, y)}
                      p2={vec(chartBounds.right, y)}
                      color={lineColor[l.kind]}
                      strokeWidth={1.5}
                    >
                      <DashPathEffect intervals={DASHES[l.kind]} />
                    </SkiaLine>
                  );
                })}
              </>
            )}
          </CartesianChart>
        </View>
        <ThresholdLabels
          thresholds={thresholds}
          colorOf={(k) => lineColor[k]}
          frame={frame}
        />
      </Pressable>
    </View>
  );
}

/** Labels on the right edge, just above their lines, spread apart and kept above the X axis. */
function ThresholdLabels({
  thresholds,
  colorOf,
  frame,
}: {
  thresholds: Threshold[];
  colorOf: (kind: ThresholdKind) => string;
  frame: Frame;
}) {
  const { width, bounds, yScale } = frame;
  if (!bounds || !yScale || width === 0) return null;
  const tops = spreadLabelPositions(
    thresholds.map((l) => yScale(l.value)),
    LABEL_LINE,
    LABEL_LINE + 2,
    bounds.bottom - LABEL_LINE,
  );
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {thresholds.map((l, i) => (
        <ThemedText
          key={l.kind}
          variant="labelSmall"
          tint={colorOf(l.kind)}
          maxFontSizeMultiplier={LABEL_MAX_SCALE}
          style={[
            styles.label,
            { top: tops[i], right: width - bounds.right + 2 },
          ]}
        >
          {l.label}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: HEIGHT },
  fill: { flex: 1 },
  label: { position: "absolute" },
});
