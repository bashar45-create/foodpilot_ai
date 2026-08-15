import { memo } from 'react';
import { View, StyleSheet } from 'react-native';

import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';

type Tone = 'plain' | 'accent' | 'danger' | 'solid';

const tones: Record<
  Tone,
  { bg: string; fg: string; border: string }
> = {
  plain: { bg: colors.background, fg: colors.text, border: colors.border },
  accent: { bg: colors.accent, fg: colors.accentInk, border: colors.border },
  danger: { bg: colors.background, fg: colors.text, border: colors.border },
  solid: { bg: colors.text, fg: colors.inverse, border: colors.border },
};

interface StatusChipProps {
  label: string;
  tone?: Tone;
}

function StatusChipImpl({ label, tone = 'plain' }: StatusChipProps): JSX.Element {
  const palette = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <AppText variant="overline" style={{ color: palette.fg }}>
        {label}
      </AppText>
    </View>
  );
}

export const StatusChip = memo(StatusChipImpl);

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
});
