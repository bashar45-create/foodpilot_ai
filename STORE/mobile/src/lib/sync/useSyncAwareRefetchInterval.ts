import { useSyncConnection } from './SyncConnectionContext';

/**
 * Resolves the `refetchInterval` a React Query hook should use, per
 * research.md Decision 6: rely purely on the live push connection while
 * it's up, and only fall back to 15s polling once the connection has been
 * down long enough for SyncConnectionContext to flip pollingFallbackActive.
 *
 * @param idleIntervalMs what to use while the live connection is healthy —
 *   `false` (no polling) or an existing baseline interval a screen already
 *   relied on before sync existed. Defaults to `false`.
 */
export function useSyncAwareRefetchInterval(idleIntervalMs: number | false = false): number | false {
  const { pollingFallbackActive } = useSyncConnection();
  return pollingFallbackActive ? 15_000 : idleIntervalMs;
}
