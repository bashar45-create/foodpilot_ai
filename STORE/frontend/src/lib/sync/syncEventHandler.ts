import type { QueryClient, QueryKey } from '@tanstack/react-query';

import {
  allocationKeys,
  assignmentKeys,
  attendanceKeys,
  foodKeys,
  inventoryKeys,
  recipeKeys,
  saleKeys,
  storeInventoryKeys,
  storeKeys,
  ticketKeys,
  userKeys,
} from '@/api/queryKeys';

import type { SyncEvent } from './types';

/**
 * Pure lookup from a SyncEvent to the query keys that must be invalidated.
 * See specs/001-realtime-data-sync/contracts/entity-query-key-map.md for the
 * canonical entity -> query-key table this implements.
 */
export function resolveInvalidations(event: SyncEvent): QueryKey[] {
  const storeId = event.storeId ?? undefined;

  switch (event.entity) {
    case 'storeInventory':
      return storeId
        ? [storeInventoryKeys.list(storeId), storeInventoryKeys.lowStock(storeId)]
        : [];
    case 'inventory':
      return [inventoryKeys.list(), inventoryKeys.detail(event.recordId), inventoryKeys.lowStock(), ['analytics', 'inventory']];
    case 'sale':
      // Sales feed derived analytics/dashboard aggregates too — invalidate
      // those key families by prefix (not exact params) so every cached
      // variant (any storeId/date-range) is covered, per
      // contracts/entity-query-key-map.md.
      return [
        saleKeys.list(storeId),
        saleKeys.detail(event.recordId),
        ['analytics', 'dashboard'],
        ['analytics', 'revenue'],
        ['dashboard', 'overview'],
      ];
    case 'recipe':
      return [recipeKeys.list(), recipeKeys.detail(event.recordId), recipeKeys.cost(event.recordId)];
    case 'attendance':
      return [attendanceKeys.today];
    case 'ticket':
      // Prefix invalidation covers the unfiltered list, every status-filtered
      // list, and the selected ticket detail query.
      return [['tickets'], ticketKeys.list(), ticketKeys.detail(event.recordId)];
    case 'store':
      return [storeKeys.list(), storeKeys.detail(event.recordId)];
    case 'allocation':
      // ['allocations'] prefix-matches .all/.list/.detail/.storeSummary alike.
      return [allocationKeys.all, allocationKeys.detail(event.recordId), ['allocations']];
    case 'assignment':
      // ['assignments'] prefix-matches .daily/.recent alike, regardless of storeId/date params.
      return storeId ? [assignmentKeys.recent(storeId), ['assignments']] : [['assignments']];
    case 'food':
      return [foodKeys.list(), foodKeys.detail(event.recordId)];
    case 'user':
      return [userKeys.list(), userKeys.detail(event.recordId)];
    default:
      return [];
  }
}

/** Detail-view query keys to purge outright (not just invalidate) when a record is deleted. */
function detailKeyForDeletion(event: SyncEvent): QueryKey | null {
  switch (event.entity) {
    case 'inventory':
      return inventoryKeys.detail(event.recordId);
    case 'sale':
      return saleKeys.detail(event.recordId);
    case 'recipe':
      return recipeKeys.detail(event.recordId);
    case 'ticket':
      return ticketKeys.detail(event.recordId);
    case 'store':
      return storeKeys.detail(event.recordId);
    case 'allocation':
      return allocationKeys.detail(event.recordId);
    case 'food':
      return foodKeys.detail(event.recordId);
    case 'user':
      return userKeys.detail(event.recordId);
    default:
      return null;
  }
}

export function applySyncEvent(queryClient: QueryClient, event: SyncEvent): void {
  for (const key of resolveInvalidations(event)) {
    queryClient.invalidateQueries({ queryKey: key });
  }
  if (event.action === 'deleted') {
    const detailKey = detailKeyForDeletion(event);
    if (detailKey) {
      queryClient.removeQueries({ queryKey: detailKey });
    }
  }
}
