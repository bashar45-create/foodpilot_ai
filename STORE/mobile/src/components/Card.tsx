import { memo, type ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';

import { colors } from '@/lib/colors';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  filled?: boolean;
}

function CardImpl({ children, style, filled }: CardProps): JSX.Element {
  return (
    <View
      style={[
        styles.card,
        filled ? styles.cardFilled : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export const Card = memo(CardImpl);

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 10,
  },
  cardFilled: {
    backgroundColor: colors.accent,
  },
});
