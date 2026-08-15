import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';
import {
  getAssignment,
  listRecentAssignments,
  upsertAssignment,
  type DailyAssignment,
  type UpsertAssignmentRequest,
} from '@/api/endpoints/assignments';
import { assignmentKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export function useAssignment(storeId: string | undefined, date: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: assignmentKeys.daily(storeId ?? '', date ?? ''),
    queryFn: () => getAssignment(storeId as string, date as string),
    enabled: Boolean(storeId && date),
    refetchInterval,
  });
}

export function useRecentAssignments(storeId: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: assignmentKeys.recent(storeId ?? ''),
    queryFn: () => listRecentAssignments(storeId as string),
    enabled: Boolean(storeId),
    refetchInterval,
  });
}

export function useUpsertAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertAssignmentRequest) => upsertAssignment(input),
    onSuccess: (data: DailyAssignment) => {
      qc.invalidateQueries({ queryKey: assignmentKeys.daily(data.storeId, data.date) });
      qc.invalidateQueries({ queryKey: assignmentKeys.recent(data.storeId) });
    },
  });
}