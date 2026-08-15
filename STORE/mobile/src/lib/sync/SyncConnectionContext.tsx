import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { SyncBanner } from '@/components/SyncBanner';

import { applySyncEvent } from './syncEventHandler';
import { syncClient } from './syncClient';
import type { SyncConnectionState, SyncEvent } from './types';

/** How long a disconnect must persist before dependent queries fall back to 15s polling (research.md Decision 6). */
const POLLING_FALLBACK_GRACE_MS = 5_000;

interface SyncConnectionContextValue extends SyncConnectionState {
  pollingFallbackActive: boolean;
}

const SyncConnectionContext = createContext<SyncConnectionContextValue>({
  status: 'connecting',
  lastConnectedAt: null,
  reconnectAttempts: 0,
  pollingFallbackActive: false,
});

function describeEvent(event: SyncEvent): string {
  const verb = event.action === 'created' ? 'added' : event.action === 'deleted' ? 'removed' : 'updated';
  return `${event.entity} ${verb} by another user`;
}

export function SyncConnectionProvider({ children }: { children: ReactNode }): JSX.Element {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<SyncConnectionState>(syncClient.getState());
  const [pollingFallbackActive, setPollingFallbackActive] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasConnected = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    syncClient.connect();
    const unsubscribeEvents = syncClient.onEvent((event) => {
      applySyncEvent(queryClient, event);
      if (event.actorUserId !== user?.userId) {
        setBannerMessage(describeEvent(event));
      }
    });

    const unsubscribeStatus = syncClient.onStatusChange((next) => {
      setState(next);

      if (next.status === 'connected') {
        if (fallbackTimer.current) {
          clearTimeout(fallbackTimer.current);
          fallbackTimer.current = null;
        }
        setPollingFallbackActive(false);
        if (wasConnected.current === false) {
          void queryClient.invalidateQueries();
        }
        wasConnected.current = true;
      } else {
        wasConnected.current = false;
        if (!fallbackTimer.current) {
          fallbackTimer.current = setTimeout(() => {
            setPollingFallbackActive(true);
          }, POLLING_FALLBACK_GRACE_MS);
        }
      }
    });

    // App resume from background is treated the same as a network reconnect —
    // catch up mounted queries even if the socket itself never dropped.
    const appStateSubscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void queryClient.invalidateQueries();
      }
    });

    return () => {
      unsubscribeEvents();
      unsubscribeStatus();
      appStateSubscription.remove();
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      syncClient.disconnect();
    };
  }, [isAuthenticated, queryClient, user?.userId]);

  return (
    <SyncConnectionContext.Provider value={{ ...state, pollingFallbackActive }}>
      {children}
      <SyncBanner message={bannerMessage} onHide={() => setBannerMessage(null)} />
    </SyncConnectionContext.Provider>
  );
}

export function useSyncConnection(): SyncConnectionContextValue {
  return useContext(SyncConnectionContext);
}
