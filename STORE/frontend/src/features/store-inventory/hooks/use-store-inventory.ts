import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';
import {
  listLowStock,
  listStoreInventory,
  setStock,
  type SetStockRequest,
  type StoreInventoryRow,
} from '@/api/endpoints/storeInventory';
import { storeInventoryKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export function useStoreInventory(storeId: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: storeInventoryKeys.list(storeId ?? ''),
    queryFn: () => listStoreInventory(storeId as string),
    enabled: Boolean(storeId),
    refetchInterval,
  });
}

export function useStoreLowStock(storeId: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: storeInventoryKeys.lowStock(storeId ?? ''),
    queryFn: () => listLowStock(storeId as string),
    enabled: Boolean(storeId),
    refetchInterval,
  });
}

export function useSetStock(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<SetStockRequest, 'storeId'>) => setStock({ ...input, storeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: storeInventoryKeys.list(storeId) });
      qc.invalidateQueries({ queryKey: storeInventoryKeys.lowStock(storeId) });
    },
  });
}

export type { StoreInventoryRow };