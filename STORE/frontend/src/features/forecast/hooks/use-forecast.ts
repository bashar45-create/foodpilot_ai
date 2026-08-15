import { useQuery } from '@/lib/query-helpers';
import { getDailyForecast, getProjectedDailyForecast } from '@/api/endpoints/forecast';
import { forecastKeys } from '@/api/queryKeys';

export function useDailyForecast(days = 7) {
  return useQuery({
    queryKey: forecastKeys.daily(days),
    queryFn: () => getDailyForecast(days),
  });
}

export function useProjectedDailyForecast(days = 7, top = 10, storeId?: string) {
  return useQuery({
    queryKey: forecastKeys.projected(days, top, storeId),
    queryFn: () => getProjectedDailyForecast(days, top, storeId),
  });
}