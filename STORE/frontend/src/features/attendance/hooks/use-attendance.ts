import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';

import {
  clockIn,
  clockOut,
  getAttendanceToday,
  getEmployeeAttendance,
  markAttendanceStatus,
  type AttendanceStatus,
} from '@/api/endpoints/attendance';
import { attendanceKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export function useAttendanceToday() {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: attendanceKeys.today,
    queryFn: () => getAttendanceToday(),
    refetchInterval,
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { storeId?: string | null } = {}) => clockIn(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attendanceKeys.today });
    },
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clockOut(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attendanceKeys.today });
    },
  });
}

export function useEmployeeAttendance(userId: string | null, range: { start: string; end: string }) {
  return useQuery({
    queryKey: userId ? attendanceKeys.employee(userId, range.start, range.end) : ['attendance', 'disabled'],
    queryFn: () => getEmployeeAttendance(userId as string, range),
    enabled: Boolean(userId),
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      userId: string;
      date: string;
      status: AttendanceStatus;
      storeId?: string | null;
      note?: string;
    }) => markAttendanceStatus(payload),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}