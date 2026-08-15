import { memo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle, type TextStyle } from 'react-native';

import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';

type Variant = 'primary' | 'outline' | 'ghost';

interface PrimaryButtonProps {
  label: string;
  caption?: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
  labelStyle?: TextStyle;
}

function PrimaryButtonImpl({
  label,
  caption,
  onPress,
  variant = 'primary',
  disabled,
  style,
  labelStyle,
}: PrimaryButtonProps): JSX.Element {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      <AppText
        variant="bodyBold"
        style={[styles.label, styles[`${variant}Label`], labelStyle]}
      >
        {label}
      </AppText>
      {caption ? (
        <AppText variant="caption" style={styles.caption}>
          {caption}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export const PrimaryButton = memo(PrimaryButtonImpl);

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    gap: 4,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.border },
  outline: { backgroundColor: colors.background, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  label: { letterSpacing: 0.2 },
  primaryLabel: { color: colors.accentInk },
  outlineLabel: { color: colors.text },
  ghostLabel: { color: colors.text },
  caption: { color: colors.textFaint },
  disabled: { opacity: 0.35 },
  pressed: { backgroundColor: colors.pressed },
});
