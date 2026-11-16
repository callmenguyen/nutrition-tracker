import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewProps } from "react-native";

import { layout } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * A notebook page: content is aligned to a 40 dp margin column with a faint red rule,
 * like writing in a vở. The rule is decoration; meaning only comes from MarginRow marks.
 */
export function NotebookPage({
  children,
  style,
  ...rest
}: ViewProps & { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.page, style]} {...rest}>
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={[styles.rule, { backgroundColor: colors.margin }]}
      />
      {children}
    </View>
  );
}

export type MarginMark = "alert";

const MARK_SIZE = 24;

type MarginRowProps = ViewProps & {
  children: ReactNode;
  /**
   * Line height of the row's first line, so the 24 dp mark is centred on it: 24 for Body /
   * Title Medium (default), 28 for a Title first line (nutrient values).
   */
  firstLineHeight?: number;
} & (
    | {
        /** Status mark drawn inside the margin column (never in the content). */
        mark: MarginMark;
        /** Spoken label for the mark, e.g. "Vượt ngưỡng" (required so TalkBack can name it). */
        markLabel: string;
      }
    | { mark?: null; markLabel?: never }
  );

/** A row whose status mark sits in the margin column, aligned with the row's first line. */
export function MarginRow({
  children,
  mark,
  markLabel,
  firstLineHeight = 24,
  style,
  ...rest
}: MarginRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]} {...rest}>
      <View
        style={[
          styles.gutter,
          { paddingTop: (firstLineHeight - MARK_SIZE) / 2 },
        ]}
      >
        {mark === "alert" ? (
          // Drawn with views: expo-symbols' Android glyph was offset and clipped by its own box.
          <View
            style={[styles.mark, { borderColor: colors.error }]}
            accessibilityLabel={markLabel}
            accessible
            testID="margin-mark-alert"
          >
            <Text style={[styles.markText, { color: colors.error }]}>!</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  rule: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: layout.marginColumn - 8,
    width: StyleSheet.hairlineWidth * 2,
    opacity: 0.45,
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  // The mark is centred in the 32 dp left of the rule (at 32 dp), so it never touches the rule.
  gutter: {
    width: layout.marginColumn,
    paddingRight: layout.marginColumn - 32,
    alignItems: "center",
  },
  content: { flex: 1, paddingRight: 16 },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: MARK_SIZE / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    includeFontPadding: false,
  },
});
