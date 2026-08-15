import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/context/auth-context';

import { applySyncEvent } from './syncEventHandler';
import { syncClient } from './syncClient';
import type { SyncConnectionState, SyncEvent } from './types';

/** How long a disconnect must persist before we switch dependent queries to 15s polling (research.md Decision 6). */
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
  const { user, accessToken } = useAuth();
  const [state, setState] = useState<SyncConnectionState>(syncClient.getState());
  const [pollingFallbackActive, setPollingFallbackActive] = useState(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasConnected = useRef(false);

  useEffect(() => {
    if (!accessToken) return undefined;

    syncClient.connect();
    const unsubscribeEvents = syncClient.onEvent((event) => {
      applySyncEvent(queryClient, event);
      // FR-011/FR-012: apply the update even if it overwrites an in-progress
      // edit, and always surface an explicit notification — except to the
      // user whose own action caused it, per the self-notification suppression rule.
      if (event.actorUserId !== user?.userId) {
        toast(describeEvent(event));
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
        // Reconnect catch-up (research.md Decision 5): resync everything mounted.
        if (wasConnected.current === false) {
          queryClient.invalidateQueries();
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

    return () => {
      unsubscribeEvents();
      unsubscribeStatus();
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      syncClient.disconnect();
    };
  }, [accessToken, queryClient, user?.userId]);

  return (
    <SyncConnectionContext.Provider value={{ ...state, pollingFallbackActive }}>
      {children}
    </SyncConnectionContext.Provider>
  );
}

export function useSyncConnection(): SyncConnectionContextValue {
  return useContext(SyncConnectionContext);
}
