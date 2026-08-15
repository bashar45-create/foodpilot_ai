import { memo, type ReactNode } from 'react';
import { SafeAreaView, View, StyleSheet, ScrollView, RefreshControl } from 'react-native';

import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';

interface AppScreenProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
  scrollable?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function AppScreenImpl({
  title,
  subtitle,
  right,
  children,
  scrollable = true,
  onRefresh,
  refreshing,
}: AppScreenProps): JSX.Element {
  const body = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <AppText variant="title">{title}</AppText>
            {subtitle ? (
              <AppText variant="caption" style={styles.subtitle}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {right}
        </View>
        {scrollable ? (
          <ScrollView
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={Boolean(refreshing)}
                  onRefresh={onRefresh}
                  tintColor={colors.text}
                />
              ) : undefined
            }
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </View>
    </SafeAreaView>
  );
}

export const AppScreen = memo(AppScreenImpl);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 22,
    gap: 12,
  },
  titleBlock: { flex: 1 },
  subtitle: { marginTop: 4 },
  body: { gap: 16 },
  scrollBody: { gap: 16, paddingBottom: 96 },
});
