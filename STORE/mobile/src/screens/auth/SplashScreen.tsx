import { memo } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';

import { AppText } from '@/lib/typography';
import { colors } from '@/lib/colors';

function SplashScreenImpl(): JSX.Element {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.brandWrap}>
          <AppText variant="display" style={styles.brand}>STORE</AppText>
          <View style={styles.divider} />
          <AppText variant="overline">Worker console</AppText>
        </View>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    </SafeAreaView>
  );
}

export const SplashScreen = memo(SplashScreenImpl);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  brandWrap: { alignItems: 'center', gap: 12 },
  brand: { letterSpacing: 6 },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: colors.border,
  },
});