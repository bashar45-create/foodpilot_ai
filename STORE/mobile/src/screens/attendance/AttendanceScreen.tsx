import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StatusChip } from '@/components/StatusChip';
import { useAuth } from '@/context/AuthContext';
import {
  clockIn,
  clockOut,
  getAttendanceToday,
  type AttendanceRecord,
} from '@/api/endpoints/attendance';
import { ApiException } from '@/types/api';
import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';
import { formatClockTime as fmtClock } from '@/lib/dates';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

function AttendanceScreenImpl(): JSX.Element {
  const { user } = useAuth();
  const qc = useQueryClient();
  const refetchInterval = useSyncAwareRefetchInterval(60_000);

  const todayQuery = useQuery({
    queryKey: ['attendance', 'today', user?.userId ?? ''],
    queryFn: getAttendanceToday,
    refetchInterval,
  });

  const record: AttendanceRecord | null =
    todayQuery.data && (todayQuery.data as AttendanceRecord).status
      ? (todayQuery.data as AttendanceRecord)
      : null;

  const clockInMut = useMutation({
    mutationFn: () => clockIn({ storeId: user?.assignedStore ?? null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
  const clockOutMut = useMutation({
    mutationFn: () => clockOut(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });

  const onRefresh = useCallback(() => {
    void todayQuery.refetch();
  }, [todayQuery]);

  const clockedIn = Boolean(record?.clockIn);
  const clockedOut = Boolean(record?.clockOut);
  const errorMessage =
    clockInMut.error instanceof ApiException
      ? clockInMut.error.message
      : clockOutMut.error instanceof ApiException
        ? clockOutMut.error.message
        : null;

  const onClockIn = useCallback(() => clockInMut.mutate(), [clockInMut]);
  const onClockOut = useCallback(() => clockOutMut.mutate(), [clockOutMut]);

  return (
    <AppScreen
      title="Attendance"
      subtitle={new Date().toDateString()}
      onRefresh={onRefresh}
      refreshing={todayQuery.isFetching}
    >
      <Card>
        <View style={styles.row}>
          <AppText variant="overline">Status</AppText>
          <StatusChip
            tone="solid"
            label={
              !record
                ? 'NOT STARTED'
                : clockedOut
                  ? 'DONE'
                  : clockedIn
                    ? 'ON SHIFT'
                    : (record.status ?? 'PRESENT')
            }
          />
        </View>
        <View style={styles.timeGrid}>
          <View style={styles.timeCell}>
            <AppText variant="overline" faint>Clock in</AppText>
            <AppText variant="metric" style={styles.metricTop}>{fmtClock(record?.clockIn)}</AppText>
          </View>
          <View style={styles.timeCell}>
            <AppText variant="overline" faint>Clock out</AppText>
            <AppText variant="metric" style={styles.metricTop}>{fmtClock(record?.clockOut)}</AppText>
          </View>
        </View>
        {errorMessage ? <AppText variant="body">{errorMessage}</AppText> : null}
        <View style={styles.actions}>
          <PrimaryButton
            label={clockedIn ? 'Already clocked in' : 'Clock in'}
            onPress={onClockIn}
            disabled={clockedIn || clockInMut.isPending}
          />
          <PrimaryButton
            label={clockedOut ? 'Already clocked out' : 'Clock out'}
            variant="outline"
            onPress={onClockOut}
            disabled={!clockedIn || clockedOut || clockOutMut.isPending}
          />
        </View>
      </Card>
      <AppText variant="caption" style={styles.help}>
        Your manager uses these times to track attendance. Pull down to refresh.
      </AppText>
    </AppScreen>
  );
}

export const AttendanceScreen = memo(AttendanceScreenImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeGrid: { flexDirection: 'row', gap: 12 },
  timeCell: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  actions: { gap: 10 },
  metricTop: { marginTop: 6 },
  help: { color: colors.text, textAlign: 'center', opacity: 0.6 },
});
