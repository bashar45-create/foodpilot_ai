import { memo, useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Ticket as TicketIcon, BookOpen } from 'lucide-react-native';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StatusChip } from '@/components/StatusChip';
import { Metric } from '@/components/Section';
import { useAuth } from '@/context/AuthContext';
import { getStore, type Store } from '@/api/endpoints/stores';
import { getAttendanceToday, type AttendanceRecord } from '@/api/endpoints/attendance';
import { listTickets } from '@/api/endpoints/tickets';
import { AppText } from '@/lib/typography';
import { colors } from '@/lib/colors';
import { formatClockTime } from '@/lib/dates';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

type Nav = NativeStackNavigationProp<Record<string, undefined>>;

interface TileProps {
  label: string;
  caption: string;
  icon: JSX.Element;
  onPress: () => void;
}

const Tile = memo(function Tile({ label, caption, icon, onPress }: TileProps): JSX.Element {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null]}>
      <View style={styles.tileIcon}>{icon}</View>
      <AppText variant="bodyBold">{label}</AppText>
      <AppText variant="caption">{caption}</AppText>
    </Pressable>
  );
});

function fmtClock(iso?: string | null): string {
  return formatClockTime(iso);
}

function ProfileScreenImpl(): JSX.Element {
  const { user, logout } = useAuth();
  const nav = useNavigation<Nav>();
  const storeId = user?.assignedStore ?? '';
  const [busy, setBusy] = useState(false);
  const refetchInterval = useSyncAwareRefetchInterval();

  const storeQuery = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => getStore(storeId),
    enabled: Boolean(storeId),
    refetchInterval,
  });

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'today', user?.userId ?? ''],
    queryFn: getAttendanceToday,
    refetchInterval,
  });

  const ticketsQuery = useQuery({
    queryKey: ['tickets', 'mine', user?.userId ?? ''],
    queryFn: listTickets,
    enabled: Boolean(user),
    refetchInterval,
  });

  const onRefresh = useCallback(() => {
    void storeQuery.refetch();
    void attendanceQuery.refetch();
    void ticketsQuery.refetch();
  }, [storeQuery, attendanceQuery, ticketsQuery]);

  const onLogout = useCallback((): void => {
    Alert.alert(
      'Log out',
      'You will need to log in again next time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await logout();
            } finally {
              setBusy(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [logout]);

  const store: Store | null = storeQuery.data ?? null;
  const attendanceData = attendanceQuery.data as AttendanceRecord | undefined;
  const attendance: AttendanceRecord | null =
    attendanceData && attendanceData.status ? attendanceData : null;
  const openTickets = useMemo(
    () => (ticketsQuery.data ?? []).filter((t) => (t.status ?? '').toUpperCase() === 'OPEN').length,
    [ticketsQuery.data],
  );

  const goTickets = useCallback(() => nav.navigate('Tickets'), [nav]);
  const goRecipes = useCallback(() => nav.navigate('Recipes'), [nav]);

  return (
    <AppScreen
      title="Profile"
      subtitle="Account and assigned store details."
      onRefresh={onRefresh}
      refreshing={storeQuery.isFetching || attendanceQuery.isFetching || ticketsQuery.isFetching}
    >
      <Card filled>
        <AppText variant="title">{user?.name ?? 'Worker'}</AppText>
        <AppText variant="caption">{user?.email ?? 'No email on file'}</AppText>
        <View style={styles.chipRow}>
          <StatusChip label={(user?.role ?? 'WORKER').toUpperCase()} tone="solid" />
          <StatusChip
            label={attendance ? (attendance.status ?? 'PRESENT') : 'OFFLINE'}
            tone={attendance ? 'accent' : 'plain'}
          />
          {openTickets > 0 ? (
            <StatusChip tone="danger" label={`${openTickets} OPEN TICKET${openTickets === 1 ? '' : 'S'}`} />
          ) : null}
        </View>
      </Card>

      <Card>
        <AppText variant="overline">Assigned store</AppText>
        {store ? (
          <View style={styles.stack}>
            <AppText variant="heading">{store.name}</AppText>
            <AppText variant="body" faint>
              {store.address ?? 'No address on file'}
              {store.city ? `, ${store.city}` : ''}
            </AppText>
            <AppText variant="body">Code: {store.code ?? '—'}</AppText>
            <AppText variant="body">
              Hours: {store.openingTime ?? '—'} → {store.closingTime ?? '—'}
            </AppText>
            <AppText variant="body">Phone: {store.phone ?? '—'}</AppText>
          </View>
        ) : storeQuery.isError ? (
          <AppText variant="body" faint>
            Couldn't load your store. Pull to refresh to try again.
          </AppText>
        ) : (
          <AppText variant="body" faint>
            {storeId ? 'Loading store…' : 'You are not currently assigned to a store. Ask your manager.'}
          </AppText>
        )}
      </Card>

      <Card>
        <AppText variant="overline">Today</AppText>
        <View style={styles.metricsRow}>
          <Metric label="Clocked in" value={fmtClock(attendance?.clockIn)} />
          <Metric label="Clocked out" value={fmtClock(attendance?.clockOut)} />
        </View>
      </Card>

      <View style={styles.tileRow}>
        <Tile
          label="My tickets"
          caption="Submit and follow up with admin."
          icon={<TicketIcon size={20} color={colors.text} strokeWidth={1.6} />}
          onPress={goTickets}
        />
        <Tile
          label="Recipes"
          caption="Prep reference for every menu item."
          icon={<BookOpen size={20} color={colors.text} strokeWidth={1.6} />}
          onPress={goRecipes}
        />
      </View>

      <PrimaryButton
        label={busy ? 'Logging out…' : 'Log out'}
        variant="outline"
        onPress={onLogout}
        disabled={busy}
      />
    </AppScreen>
  );
}

export const ProfileScreen = memo(ProfileScreenImpl);

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  stack: { gap: 4, marginTop: 6 },
  metricsRow: { flexDirection: 'row', gap: 12 },
  tileRow: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 4,
  },
  tileIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 4,
  },
  pressed: { backgroundColor: colors.pressed },
});