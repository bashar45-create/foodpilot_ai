import { memo } from 'react';
import { View, StyleSheet } from 'react-native';

import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';

function OfflineBannerImpl({ visible = false }: { visible?: boolean }): JSX.Element | null {
  if (!visible) return null;
  return (
    <View style={styles.banner}>
      <AppText variant="caption" style={styles.text}>
        No connection — actions will fail until back online.
      </AppText>
    </View>
  );
}

export const OfflineBanner = memo(OfflineBannerImpl);

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  text: { color: colors.text, textAlign: 'center' },
});
