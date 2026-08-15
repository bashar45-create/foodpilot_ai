import { Text, type TextProps } from 'react-native';

import { colors } from './colors';

/**
 * Tight, geometric typography stack. The whole app reads from here so
 * nothing drifts off the system.
 */
export const text = {
  display: { fontSize: 32, lineHeight: 36, fontWeight: '900' as const, letterSpacing: -0.5, color: colors.text },
  title: { fontSize: 24, lineHeight: 28, fontWeight: '900' as const, letterSpacing: -0.4, color: colors.text },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '800' as const, letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const, color: colors.text },
  bodyBold: { fontSize: 15, lineHeight: 22, fontWeight: '800' as const, color: colors.text },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, color: colors.textFaint },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.text,
  },
  metric: { fontSize: 36, lineHeight: 40, fontWeight: '900' as const, letterSpacing: -1, color: colors.text },
};

interface AppTextProps extends TextProps {
  variant?: keyof typeof text;
  faint?: boolean;
}

export function AppText({
  variant = 'body',
  faint,
  style,
  ...rest
}: AppTextProps): JSX.Element {
  const base = text[variant];
  return (
    <Text
      {...rest}
      style={[
        base,
        faint ? { color: colors.textFaint } : null,
        style,
      ]}
    />
  );
}
