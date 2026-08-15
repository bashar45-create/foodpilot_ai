import { useQuery } from '@/lib/query-helpers';
import { getDashboard } from '@/api/endpoints/dashboard';
import { dashboardKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export function useDashboard(storeId?: string) {
  // Dashboard aggregates sale/inventory data, both covered live by sync;
  // only poll while the connection is down.
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: dashboardKeys.overview(storeId),
    queryFn: () => getDashboard(storeId),
    refetchInterval,
  });
}