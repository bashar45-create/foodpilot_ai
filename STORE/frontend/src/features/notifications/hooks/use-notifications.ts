import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';
import { listNotifications, markNotificationRead } from '@/api/endpoints/notifications';
import { notificationKeys } from '@/api/queryKeys';

export function useNotifications(storeId?: string) {
  return useQuery({
    queryKey: notificationKeys.list(storeId),
    queryFn: () => listNotifications(storeId),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}