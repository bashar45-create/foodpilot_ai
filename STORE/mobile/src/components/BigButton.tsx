import { memo, type ReactNode } from 'react';
import { Pressable, View, StyleSheet, type ViewStyle } from 'react-native';

import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';

type Variant = 'primary' | 'outline' | 'soft';

interface BigButtonProps {
  label: string;
  caption?: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}

function BigButtonImpl({
  label,
  caption,
  onPress,
  variant = 'primary',
  disabled,
  icon,
  style,
}: BigButtonProps): JSX.Element {
  const container =
    variant === 'primary' ? styles.primary : variant === 'soft' ? styles.soft : styles.outline;
  const labelInk = variant === 'primary' ? styles.primaryLabel : styles.outlineLabel;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.container,
        container,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <View style={styles.textWrap}>
          <AppText variant="title" style={labelInk}>
            {label}
          </AppText>
          {caption ? (
            <AppText variant="body" style={[styles.caption, labelInk]}>
              {caption}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const BigButton = memo(BigButtonImpl);

const styles = StyleSheet.create({
  container: {
    paddingVertical: 22,
    paddingHorizontal: 22,
    borderRadius: 16,
    borderWidth: 1.5,
    minHeight: 92,
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.border },
  soft: { backgroundColor: colors.background, borderColor: colors.border },
  outline: { backgroundColor: colors.background, borderColor: colors.border },
  primaryLabel: { color: colors.accentInk },
  outlineLabel: { color: colors.text },
  caption: { marginTop: 4 },
  disabled: { opacity: 0.35 },
  pressed: { backgroundColor: colors.pressed },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 28, alignItems: 'center' },
  textWrap: { flex: 1 },
});
