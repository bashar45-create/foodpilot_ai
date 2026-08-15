import { memo, type ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';

interface SectionHeaderProps {
  label: string;
  action?: { label: string; onPress: () => void };
}

function SectionHeaderImpl({ label, action }: SectionHeaderProps): JSX.Element {
  return (
    <View style={styles.row}>
      <AppText variant="overline">{label}</AppText>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <AppText variant="overline" style={styles.action}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export const SectionHeader = memo(SectionHeaderImpl);

interface MetricProps {
  label: string;
  value: string;
  accent?: boolean;
  /**
   * `size` controls how the value renders:
   *   - 'compact' (default) — used in 3-up rows on small screens; auto-shrinks to fit.
   *   - 'metric' — full 36px display number, for hero KPIs only.
   */
  size?: 'compact' | 'metric';
}

function MetricImpl({ label, value, accent, size = 'compact' }: MetricProps): JSX.Element {
  return (
    <View style={styles.metric}>
      <AppText
        variant="overline"
        numberOfLines={1}
        style={accent ? styles.accentLabel : undefined}
      >
        {label}
      </AppText>
      <AppText
        variant={size === 'metric' ? 'metric' : 'bodyBold'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[
          accent ? styles.accentValue : undefined,
          size === 'compact' ? styles.compactValue : undefined,
        ]}
      >
        {value}
      </AppText>
    </View>
  );
}

export const Metric = memo(MetricImpl);

interface DividerProps {
  label?: string;
  trailing?: ReactNode;
}

function DividerImpl({ label, trailing }: DividerProps): JSX.Element {
  return (
    <View style={styles.dividerRow}>
      {label ? (
        <AppText variant="overline" style={styles.dividerLabel}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.dividerLine} />
      {trailing}
    </View>
  );
}

export const Divider = memo(DividerImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  action: {
    color: colors.text,
    textDecorationLine: 'underline',
  },
  metric: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  accentLabel: { color: colors.text },
  accentValue: { color: colors.text },
  compactValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLabel: { color: colors.text },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderSoft,
  },
});
