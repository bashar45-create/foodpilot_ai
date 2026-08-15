import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { SyncEvent } from './types';

/**
 * Maps a SyncEvent to the query keys it should invalidate and (optionally)
 * remove. Detail keys per entity are removed on `action: 'deleted'` so a stale
 * cached row never reappears after a delete event.
 *
 * Keys target the prefixes already used by mobile screens; React Query
 * invalidates by prefix match, so a top-level key covers every more-specific
 * key derived from it. See
 * specs/001-realtime-data-sync/contracts/entity-query-key-map.md.
 */
export function resolveInvalidations(event: SyncEvent): {
  invalidate: QueryKey[];
  remove: QueryKey[];
} {
  const detailKey = (root: string, id: string | null | undefined): QueryKey =>
    id ? ([root, 'detail', id] as unknown as QueryKey) : [];

  switch (event.entity) {
    case 'storeInventory':
      return {
        invalidate: [['store-inventory'], ['store-needs-today'], ['store-low-stock']],
        remove: [],
      };
    case 'inventory':
      return {
        invalidate: [
          ['store-inventory'],
          ['store-needs-today'],
          ['store-low-stock'],
        ],
        remove: [detailKey('inventory', event.recordId)],
      };
    case 'sale':
      return { invalidate: [['sales'], ['allocations'], ['store-inventory']], remove: [] };
    case 'recipe':
      return { invalidate: [['recipes']], remove: [detailKey('recipe', event.recordId)] };
    case 'attendance':
      return { invalidate: [['attendance']], remove: [] };
    case 'ticket':
      return { invalidate: [['tickets']], remove: [detailKey('ticket', event.recordId)] };
    case 'store':
      return {
        invalidate: event.storeId ? [['store-inventory']] : [['stores']],
        remove: [detailKey('store', event.recordId)],
      };
    case 'allocation':
      return { invalidate: [['allocations'], ['store-inventory']], remove: [] };
    case 'assignment':
      return { invalidate: [['assignments']], remove: [] };
    case 'food':
      return { invalidate: [['food'], ['sales']], remove: [detailKey('food', event.recordId)] };
    case 'user':
      return { invalidate: [['users']], remove: [detailKey('user', event.recordId)] };
    default:
      return { invalidate: [], remove: [] };
  }
}

export function applySyncEvent(queryClient: QueryClient, event: SyncEvent): void {
  const { invalidate, remove } = resolveInvalidations(event);
  for (const key of invalidate) {
    queryClient.invalidateQueries({ queryKey: key });
  }
  if (event.action === 'deleted') {
    for (const key of remove) {
      queryClient.removeQueries({ queryKey: key });
    }
  }
}
