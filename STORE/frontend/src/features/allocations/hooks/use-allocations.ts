import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';

import {
  createAllocation,
  deleteAllocation,
  getAllocation,
  getStaleActiveAllocations,
  getStoreAllocationSummary,
  listAllocations,
  reclaimAllocation,
  updateAllocation,
  type Allocation,
  type AllocationCreateRequest,
  type AllocationUpdateRequest,
  type StaleActiveSummary,
} from '@/api/endpoints/allocations';
import { allocationKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

interface AllocationListParams {
  storeId?: string;
  foodId?: string;
  start?: string;
  end?: string;
  status?: string;
  limit?: number;
}

export function useAllocations(params: AllocationListParams = {}) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: allocationKeys.list(params as Record<string, string | number | undefined>),
    queryFn: () => listAllocations(params),
    refetchInterval,
  });
}

export function useAllocation(id: string | null) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: id ? allocationKeys.detail(id) : ['allocations', 'disabled'],
    queryFn: () => getAllocation(id as string),
    enabled: Boolean(id),
    refetchInterval,
  });
}

export function useStoreAllocationSummary(
  storeId: string | null,
  range: { start?: string; end?: string } = {},
) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: storeId ? allocationKeys.storeSummary(storeId, range.start, range.end) : ['allocations', 'disabled'],
    queryFn: () => getStoreAllocationSummary(storeId as string, range),
    enabled: Boolean(storeId),
    refetchInterval,
  });
}

export function useCreateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AllocationCreateRequest) => createAllocation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: allocationKeys.all });
      // Creating an allocation pulls recipe ingredients out of the master pool
      // and onto a store shelf — refresh both views so the Stock (pool) column
      // on /inventory and the per-store shelves update immediately.
      qc.invalidateQueries({ queryKey: ['inventory', 'ingredients'] });
      qc.invalidateQueries({ queryKey: ['store-inventory'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'store-summary'] });
    },
  });
}

export function useUpdateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AllocationUpdateRequest }) => updateAllocation(id, input),
    onSuccess: (allocation: Allocation) => {
      qc.invalidateQueries({ queryKey: allocationKeys.all });
      qc.setQueryData(allocationKeys.detail(allocation.id), allocation);
      // Quantity edits also move master-pool stock, so refresh the same views.
      qc.invalidateQueries({ queryKey: ['inventory', 'ingredients'] });
      qc.invalidateQueries({ queryKey: ['store-inventory'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'store-summary'] });
    },
  });
}

export function useDeleteAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAllocation(id),
    onSuccess: (allocation: Allocation) => {
      qc.invalidateQueries({ queryKey: allocationKeys.all });
      qc.setQueryData(allocationKeys.detail(allocation.id), allocation);
      qc.invalidateQueries({ queryKey: ['allocations', 'stale-active'] });
    },
  });
}

export function useReclaimAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reclaimAllocation(id),
    onSuccess: (allocation: Allocation) => {
      qc.invalidateQueries({ queryKey: allocationKeys.all });
      qc.setQueryData(allocationKeys.detail(allocation.id), allocation);
      // Also invalidate inventory/analytics so the store-summary,
      // low-stock toasts, and ingredient stock numbers refresh.
      qc.invalidateQueries({ queryKey: ['inventory', 'ingredients'] });
      qc.invalidateQueries({ queryKey: ['store-inventory'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'store-summary'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['allocations', 'stale-active'] });
    },
  });
}

export function useStaleActiveAllocations() {
  const refetchInterval = useSyncAwareRefetchInterval(15_000);
  return useQuery<StaleActiveSummary>({
    queryKey: ['allocations', 'stale-active'],
    queryFn: () => getStaleActiveAllocations(),
    refetchInterval,
  });
}


/* Summary: This file contains the  logic for the frontend. */