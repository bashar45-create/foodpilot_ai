import { useQuery } from '@/lib/query-helpers';
import {
  getDashboard,
  getEmployeesAnalytics,
  getFoodAnalytics,
  getInventoryAnalytics,
  getLowStock,
  getProfit,
  getRevenue,
  getStoreSummary,
  getStoresComparison,
  type DateRange,
  type LowStockResponse,
} from '@/api/endpoints/analytics';
import { analyticsKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

const EMPTY_RANGE: DateRange = {};

export function useDashboard(storeId?: string) {
  return useQuery({
    queryKey: analyticsKeys.dashboard(storeId),
    queryFn: () => getDashboard(storeId),
  });
}

export function useLowStockAnalytics(storeId?: string, limit = 50) {
  // Derived from the 'inventory' entity (low-stock ingredient counts), which
  // sync already covers live; only poll while the connection is down.
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery<LowStockResponse>({
    queryKey: [...analyticsKeys.dashboard(storeId ?? ''), 'low-stock', limit] as const,
    queryFn: () => getLowStock(storeId, limit),
    refetchInterval,
  });
}

export function useRevenue(range: DateRange = EMPTY_RANGE, groupBy: 'day' | 'week' | 'month' | 'store' | 'food' = 'day') {
  return useQuery({
    queryKey: analyticsKeys.revenue(range as Record<string, string | undefined>, groupBy),
    queryFn: () => getRevenue(range, groupBy),
  });
}

export function useProfit(range: DateRange = EMPTY_RANGE) {
  return useQuery({
    queryKey: analyticsKeys.profit(range as Record<string, string | undefined>),
    queryFn: () => getProfit(range),
  });
}

export function useInventoryAnalytics(range: DateRange = EMPTY_RANGE) {
  return useQuery({
    queryKey: analyticsKeys.inventory(range as Record<string, string | undefined>),
    queryFn: () => getInventoryAnalytics(range),
  });
}

export function useEmployeesAnalytics(range: DateRange = EMPTY_RANGE) {
  return useQuery({
    queryKey: analyticsKeys.employees(range as Record<string, string | undefined>),
    queryFn: () => getEmployeesAnalytics(range),
  });
}

export function useStoresComparison(range: DateRange = EMPTY_RANGE) {
  return useQuery({
    queryKey: analyticsKeys.stores(range as Record<string, string | undefined>),
    queryFn: () => getStoresComparison(range),
  });
}

export function useFoodAnalytics(range: DateRange = EMPTY_RANGE, top = 10) {
  return useQuery({
    queryKey: [...analyticsKeys.food(range as Record<string, string | undefined>), top],
    queryFn: () => getFoodAnalytics(range, top),
  });
}

export function useStoreSummary(storeId: string | undefined) {
  return useQuery({
    queryKey: [...analyticsKeys.storeSummary(storeId ?? '')],
    queryFn: () => getStoreSummary(storeId as string),
    enabled: Boolean(storeId),
  });
}