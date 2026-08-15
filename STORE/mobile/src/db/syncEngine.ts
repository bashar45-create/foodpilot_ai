import { Platform } from 'react-native';

import { apiClient } from '@/api/client';
import { enqueueItem, listQueueItems } from '@/db/offlineQueue';
import { syncClient } from '@/lib/sync/syncClient';
import type { QueueItem } from '@/types/models';

let isSyncing = false;

const isWeb = Platform.OS === 'web';

// How long to wait, after a queued write succeeds, before checking whether
// the live sync socket picked it up. This is diagnostic only — the write
// itself already succeeded via REST, and the owning service already
// publishes a SyncEvent for it (see specs/001-realtime-data-sync/tasks.md
// T036), so no separate publish path is needed here. This just catches the
// case where the socket is NOT connected at sync time, so the resulting
// cache update will be delayed until reconnect/polling-fallback rather than
// arriving live — worth a log line, not a retry.
const SYNC_EFFECT_CHECK_DELAY_MS = 3000;

async function processItem(item: QueueItem): Promise<void> {
  const payload = JSON.parse(item.payload) as Record<string, unknown>;

  if (item.type === 'SALE') {
    await apiClient.post('/api/v1/sales', payload);
    return;
  }

  if (item.type === 'STOCK_RETURN') {
    await apiClient.post('/api/v1/inventory/return', payload);
    return;
  }

  if (item.type === 'TICKET') {
    await apiClient.post('/api/v1/tickets', payload);
  }
}

function checkSyncEffectReachedClient(item: QueueItem): void {
  setTimeout(() => {
    const status = syncClient.getState().status;
    if (status !== 'connected') {
      // eslint-disable-next-line no-console
      console.warn(
        `[sync] Queued ${item.type} synced to the server, but the live sync connection is "${status}" ` +
          'rather than "connected" — other screens/devices will not see this change until reconnect or the 15s polling fallback.',
      );
    }
  }, SYNC_EFFECT_CHECK_DELAY_MS);
}

export async function syncQueue(): Promise<void> {
  if (isWeb) {
    // System is always online; nothing to sync from a persistent queue on web.
    return;
  }

  if (isSyncing) {
    return;
  }

  isSyncing = true;
  try {
    const items = await listQueueItems();
    for (const item of items) {
      if (item.status !== 'PENDING' && item.status !== 'FAILED') {
        continue;
      }

      try {
        await processItem(item);
      } catch {
        // Lightweight v1: item persistence is kept in SQLite, while the UI layer can surface sync retries later.
        // The queue item remains for manual retry or future status updates.
      }
    }
  } finally {
    isSyncing = false;
  }
}

export async function queueSale(payload: Record<string, unknown>): Promise<void> {
  if (isWeb) {
    // Fire-and-forget on web: rely on the always-online backend instead of a queue.
    await apiClient.post('/api/v1/sales', payload).catch(() => {
      // Swallow errors here; the calling screen handles UX feedback via react-query.
    });
    return;
  }

  await enqueueItem({
    type: 'SALE',
    payload: JSON.stringify(payload),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    retryCount: 0,
    errorMessage: null,
  });
}