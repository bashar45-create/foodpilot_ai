import { useEffect } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SyncStatusProvider } from '@/context/SyncStatusContext';
import { SyncConnectionProvider } from '@/lib/sync/SyncConnectionContext';
import { RootNavigator } from '@/navigation/RootNavigator';
import { attachQueryPersister } from '@/db/cachePersister';

// Per-app session buster. Bumped on logout so the next user never sees the
// previous user's cached data.
const QUERY_BUSTER = 'store_worker_v1';

function AppShell(): JSX.Element {
  const { hydrate, theme } = useAuth();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <NavigationContainer theme={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <RootNavigator />
      <StatusBar style="dark" />
    </NavigationContainer>
  );
}

function QueryPersisterBridge(): null {
  useEffect(() => attachQueryPersister(queryClient, QUERY_BUSTER), []);
  return null;
}

export function AppRoot(): JSX.Element {
  return (
    <GestureHandlerRootView style={styles.container}>
      <QueryClientProvider client={queryClient}>
        <QueryPersisterBridge />
        <AuthProvider>
          <SyncStatusProvider>
            <SyncConnectionProvider>
              <AppShell />
            </SyncConnectionProvider>
          </SyncStatusProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
