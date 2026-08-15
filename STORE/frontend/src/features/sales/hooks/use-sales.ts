import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';
import {
  getSale,
  listSales,
  recordSale,
  type CreateSaleRequest,
  type Sale,
} from '@/api/endpoints/sales';
import { saleKeys } from '@/api/queryKeys';
import { storeInventoryKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export function useSales(storeId?: string) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: saleKeys.list(storeId),
    queryFn: () => listSales(storeId),
    refetchInterval,
  });
}

export function useSale(id: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: saleKeys.detail(id ?? ''),
    queryFn: () => getSale(id as string),
    enabled: Boolean(id),
    refetchInterval,
  });
}

export function useRecordSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSaleRequest) => recordSale(input),
    onSuccess: (sale: Sale) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: storeInventoryKeys.list(sale.storeId) });
      qc.invalidateQueries({ queryKey: storeInventoryKeys.lowStock(sale.storeId) });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}