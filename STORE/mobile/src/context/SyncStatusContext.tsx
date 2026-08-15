import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { syncQueue } from '@/db/syncEngine';

interface SyncStatusState {
  isOnline: boolean;
  isSyncing: boolean;
  retrySync: () => Promise<void>;
}

const SyncStatusContext = createContext<SyncStatusState | undefined>(undefined);

export function SyncStatusProvider({ children }: { children: ReactNode }): JSX.Element {
  // The worker app is configured to be always online; we expose the same context
  // shape but skip NetInfo subscriptions on web so the UI is responsive.
  const [isOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const retrySync = useCallback(async (): Promise<void> => {
    setIsSyncing(true);
    try {
      await syncQueue();
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const value = useMemo<SyncStatusState>(
    () => ({ isOnline, isSyncing, retrySync }),
    [isOnline, isSyncing, retrySync],
  );

  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus(): SyncStatusState {
  const context = useContext(SyncStatusContext);
  if (!context) {
    throw new Error('useSyncStatus must be used within SyncStatusProvider');
  }
  return context;
}