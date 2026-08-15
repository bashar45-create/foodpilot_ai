import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Pressable,
  View,
  FlatList,
  ListRenderItem,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Clock,
  Package,
  BookOpen,
  Ticket as TicketIcon,
  TrendingUp,
  LogOut,
} from 'lucide-react-native';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StatusChip } from '@/components/StatusChip';
import { SectionHeader, Metric, Divider } from '@/components/Section';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useAuth } from '@/context/AuthContext';
import { clockIn, getAttendanceToday, type AttendanceRecord } from '@/api/endpoints/attendance';
import {
  getStoreAllocationSummary,
  type Allocation,
} from '@/api/endpoints/allocations';
import { getStore } from '@/api/endpoints/stores';
import { listSales, recordSale, type Sale } from '@/api/endpoints/sales';
import { ApiException } from '@/types/api';
import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';
import { formatClockTime } from '@/lib/dates';
import { useToday } from '@/lib/use-today';
import { formatMoney } from '@/lib/format';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

type Nav = NativeStackNavigationProp<Record<string, undefined>>;

interface PendingLine {
  foodItemId: string;
  foodName: string;
  unitPrice: number;
  quantity: number;
  soldToday: number;
  totalAllocated: number;
}

const ActionTile = memo(function ActionTile({
  glyph,
  label,
  caption,
  onPress,
}: {
  glyph: React.ReactNode;
  label: string;
  caption: string;
  onPress: () => void;
}): JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null]}
    >
      <View style={styles.tileIcon}>{glyph}</View>
      <AppText variant="heading">{label}</AppText>
      <AppText variant="caption">{caption}</AppText>
    </Pressable>
  );
});

interface AllocationRowProps {
  alloc: Allocation;
  queued: number;
  left: number;
  sold: number;
  total: number;
  onInc: (id: string) => void;
}

const AllocationRow = memo(function AllocationRow({
  alloc,
  queued,
  left,
  sold,
  total,
  onInc,
}: AllocationRowProps): JSX.Element {
  const unitPrice = Number(alloc.unitPrice ?? 0);
  // `queued` is now just the optimistic +1 indicator (auto-commit UX).
  const displaySold = sold + queued;
  const displayLeft = Math.max(total - displaySold, 0);
  return (
    <Card>
      <View style={styles.rowHeader}>
        <View style={styles.rowTitle}>
          <AppText variant="heading">{alloc.foodName ?? 'Item'}</AppText>
          <AppText variant="caption" style={styles.captionTop}>
            {formatMoney(unitPrice)} · {displaySold}/{total} sold · {displayLeft} left
          </AppText>
        </View>
        {queued > 0 ? (
          <StatusChip label={queued === 1 ? 'Saving…' : `Saving ${queued}…`} tone="accent" />
        ) : null}
      </View>

      <View style={styles.stepperRow}>
        <View style={styles.stepperDisplay}>
          <AppText variant="metric">{displaySold}</AppText>
          <AppText variant="caption">sold today</AppText>
        </View>

        <Pressable
          onPress={() => onInc(alloc.foodItemId)}
          style={({ pressed }) => [
            styles.stepperBtn,
            styles.stepperBtnAccent,
            displayLeft <= 0 ? styles.stepperDisabled : null,
            pressed ? styles.pressed : null,
          ]}
          disabled={queued >= left}
        >
          <AppText variant="display" style={[styles.stepperText, styles.stepperTextInk]}>+</AppText>
        </Pressable>
      </View>
    </Card>
  );
});

function HomeScreenImpl(): JSX.Element {
  const { user } = useAuth();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const storeId = user?.assignedStore ?? '';
  const today = useToday();

  // When the local date rolls over, drop stale per-day query caches so a
  // long-running app doesn't display yesterday's totals under today's heading.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['attendance'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['allocations'] });
    qc.invalidateQueries({ queryKey: ['store-inventory'] });
    qc.invalidateQueries({ queryKey: ['store-needs-today'] });
  }, [today, qc]);

  const refetchInterval = useSyncAwareRefetchInterval();
  const attendanceRefetchInterval = useSyncAwareRefetchInterval(60_000);

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'today', user?.userId ?? ''],
    queryFn: getAttendanceToday,
    refetchInterval: attendanceRefetchInterval,
  });

  const storeQuery = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => getStore(storeId),
    enabled: Boolean(storeId),
    refetchInterval,
  });

  const allocationQuery = useQuery({
    queryKey: ['allocations', 'summary', storeId, today],
    queryFn: () => getStoreAllocationSummary(storeId, { start: today, end: today }),
    enabled: Boolean(storeId),
    refetchInterval,
  });

  const salesQuery = useQuery({
    queryKey: ['sales', 'store', storeId],
    queryFn: () => listSales(storeId || undefined),
    enabled: Boolean(storeId),
    refetchInterval,
  });

  const todays = useMemo<Sale[]>(
    () =>
      (salesQuery.data ?? []).filter((s) => {
        if (!s.createdAt) return false;
        try {
          return new Date(s.createdAt).toISOString().slice(0, 10) === today;
        } catch {
          return false;
        }
      }),
    [salesQuery.data, today],
  );

  const totalSoldToday = useMemo(
    () => todays.reduce((s, x) => s + Number(x.quantity ?? 0), 0),
    [todays],
  );
  const totalRevenueToday = useMemo(
    () => todays.reduce((s, x) => s + Number(x.totalPrice ?? 0), 0),
    [todays],
  );

  const attendance: AttendanceRecord | null =
    attendanceQuery.data && (attendanceQuery.data as AttendanceRecord).status
      ? (attendanceQuery.data as AttendanceRecord)
      : null;
  const clockedIn = Boolean(attendance?.clockIn);
  const clockedOut = Boolean(attendance?.clockOut);

  const activeAllocations = useMemo<Allocation[]>(
    () => {
      // Two ACTIVE allocations for the same food item (e.g. two batches
      // allocated on different days) would render as two rows sharing the
      // same `pending[foodItemId]` slot — tapping + on one would visually
      // advance the other, which is misleading. Merge by foodItemId so each
      // menu item shows exactly one row with the summed quantity/sold.
      const byFood = new Map<string, Allocation>();
      for (const a of (allocationQuery.data?.allocations ?? [])) {
        if ((a.status ?? '').toUpperCase() !== 'ACTIVE') continue;
        const key = a.foodItemId;
        const existing = byFood.get(key);
        if (!existing) {
          byFood.set(key, { ...a });
          continue;
        }
        const mergedQuantity = Number(existing.quantity ?? 0) + Number(a.quantity ?? 0);
        const mergedSold = Number(existing.sold ?? 0) + Number(a.sold ?? 0);
        byFood.set(key, {
          ...existing,
          quantity: mergedQuantity,
          sold: mergedSold,
          // Preserve the freshest createdAt/updatedAt for display
          updatedAt: (a.updatedAt ?? existing.updatedAt) as string | undefined,
        });
      }
      return Array.from(byFood.values());
    },
    [allocationQuery.data],
  );

  const soldByFoodIdToday = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of todays) {
      map.set(s.foodItemId, (map.get(s.foodItemId) ?? 0) + Number(s.quantity ?? 0));
    }
    return map;
  }, [todays]);

  const [pending, setPending] = useState<Record<string, PendingLine>>({});

  useEffect(() => {
    setPending((current) => {
      let changed = false;
      const next: Record<string, PendingLine> = {};
      for (const alloc of activeAllocations) {
        const id = alloc.foodItemId;
        const soldFromServer = soldByFoodIdToday.get(id) ?? Number(alloc.sold ?? 0);
        const total = Number(alloc.quantity ?? 0);
        const previous = current[id];
        if (!previous || previous.soldToday !== soldFromServer || previous.totalAllocated !== total) {
          changed = true;
        }
        next[id] = {
          foodItemId: id,
          foodName: alloc.foodName ?? 'Item',
          unitPrice: Number(alloc.unitPrice ?? 0),
          quantity: previous?.quantity ?? 0,
          soldToday: soldFromServer,
          totalAllocated: total,
        };
      }
      return changed || Object.keys(current).length !== Object.keys(next).length ? next : current;
    });
  }, [activeAllocations, soldByFoodIdToday]);

  // Clock-in mutation wired on the home screen so the "Clock in to start
  // your shift" prompt is actionable in place — the user no longer has to
  // drill into Attendance to start their shift.
  const clockInMut = useMutation({
    mutationFn: () => clockIn({ storeId: user?.assignedStore ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => {
      const message = err instanceof ApiException ? err.message : 'Clock-in failed';
      Alert.alert('Clock in failed', message);
    },
  });

  // Single-sale mutation fired by handleInc. Auto-commit replaces the legacy
// queue/Commit-bar model: each + tap immediately POSTs to /sales and
// invalidates the affected caches. Errors roll back the optimistic bump.
const saleMutation = useMutation({
    mutationFn: ({ foodItemId, quantity }: { foodItemId: string; quantity: number }) =>
      recordSale({ storeId, foodItemId, quantity, channel: 'POS' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['allocations'] });
      qc.invalidateQueries({ queryKey: ['store-inventory'] });
      // Clear the optimistic bump — the next allocations/sales fetch will
      // bring back the authoritative `sold` count.
      setPending((current) => {
        const next: Record<string, PendingLine> = {};
        for (const id of Object.keys(current)) {
          next[id] = { ...current[id], quantity: 0 };
        }
        return next;
      });
    },
    onError: (err, variables) => {
      // Roll back the optimistic +1 so the row doesn't lie to the worker.
      setPending((current) => {
        const line = current[variables.foodItemId];
        if (!line || line.quantity <= 0) return current;
        return { ...current, [variables.foodItemId]: { ...line, quantity: line.quantity - variables.quantity } };
      });
      const message = err instanceof ApiException ? err.message : 'Could not record sale';
      Alert.alert('Sale failed', message);
    },
  });

  const handleInc = useCallback(
    (id: string) => {
      const line = pending[id];
      if (!line) return;
      const remaining = Math.max(line.totalAllocated - line.soldToday - line.quantity, 0);
      if (remaining <= 0) {
        Alert.alert('No more stock', `Only 0 more of "${line.foodName}" can be sold today.`);
        return;
      }
      if (!clockedIn) {
        Alert.alert('Clock in first', 'You need to clock in before recording sales.');
        nav.navigate('Attendance');
        return;
      }
      // Auto-commit: each tap of + records a sale immediately. We optimistically
      // bump the local counter for instant feedback, then POST to /sales.
      // The mutation invalidates ['sales'], ['allocations'], ['store-inventory']
      // so the row's `sold` and the Stock page both refresh.
      setPending((current) => ({
        ...current,
        [id]: { ...line, quantity: line.quantity + 1 },
      }));
      saleMutation.mutate({ foodItemId: id, quantity: 1 });
    },
    [pending, clockedIn, nav, saleMutation],
  );

  const pendingLines = useMemo(
    () => Object.values(pending).filter((l) => l.quantity > 0),
    [pending],
  );
  // Auto-commit UX: each + tap records one sale immediately. The pending
  // map is only used for the optimistic bump; we don't surface a Commit bar.

  const onRefresh = useCallback(() => {
    void attendanceQuery.refetch();
    void storeQuery.refetch();
    void allocationQuery.refetch();
    void salesQuery.refetch();
  }, [attendanceQuery, storeQuery, allocationQuery, salesQuery]);

  const isFetching =
    attendanceQuery.isFetching ||
    storeQuery.isFetching ||
    allocationQuery.isFetching ||
    salesQuery.isFetching;

  const totals = allocationQuery.data?.totals;
  const activeAllocated = totals?.activeAllocated ?? 0;
  const remaining = totals?.remaining ?? 0;
  const soldFromSummary = totals?.sold ?? 0;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, []);
  const firstName = useMemo(() => (user?.name ?? 'there').split(' ')[0], [user?.name]);
  const subtitleDate = useMemo(() => new Date().toDateString(), []);
  const subtitle = `${subtitleDate} · ${storeQuery.data?.name ?? 'Your store'}`;

  const renderAllocation: ListRenderItem<Allocation> = useCallback(
    ({ item }) => {
      const line = pending[item.foodItemId];
      const sold = line?.soldToday ?? 0;
      const total = line?.totalAllocated ?? 0;
      const queued = line?.quantity ?? 0;
      const left = Math.max(total - sold - queued, 0);
      return (
        <AllocationRow
          alloc={item}
          queued={queued}
          left={left}
          sold={sold}
          total={total}
          onInc={handleInc}
        />
      );
    },
    [pending, handleInc],
  );

  // Key by foodItemId now that we dedupe — keeps React keys stable across
// re-renders and prevents list re-mount thrash when the backend shuffles
// allocation rows.
const keyExtractor = useCallback((a: Allocation) => a.foodItemId, []);

  return (
    <AppScreen
      title={`${greeting}, ${firstName}`}
      subtitle={subtitle}
      onRefresh={onRefresh}
      refreshing={isFetching}
      scrollable={true}
    >
        <OfflineBanner />

        <View style={styles.kpiRow}>
          <Pressable
            onPress={() => nav.navigate('Attendance')}
            style={({ pressed }) => [styles.kpiTile, styles.kpiAccent, pressed ? styles.pressed : null]}
          >
            <AppText variant="overline" numberOfLines={1}>Clock status</AppText>
            <View style={styles.chipTop}>
              <StatusChip
                tone="solid"
                label={
                  !attendance
                    ? 'NOT STARTED'
                    : clockedOut
                      ? 'DONE'
                      : clockedIn
                        ? 'ON SHIFT'
                        : (attendance.status ?? 'PRESENT')
                }
              />
            </View>
            <View style={styles.kpiTimeRow}>
              <View style={styles.kpiTimeCell}>
                <AppText variant="overline" faint numberOfLines={1}>In</AppText>
                <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit>
                  {formatClockTime(attendance?.clockIn)}
                </AppText>
              </View>
              <View style={styles.kpiTimeCell}>
                <AppText variant="overline" faint numberOfLines={1}>Out</AppText>
                <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit>
                  {formatClockTime(attendance?.clockOut)}
                </AppText>
              </View>
            </View>
          </Pressable>

          <Card style={styles.kpiTile}>
            <AppText variant="overline" numberOfLines={1}>Today’s allocation</AppText>
            <AppText variant="metric" style={styles.metricTop} numberOfLines={1} adjustsFontSizeToFit>
              {activeAllocated}
            </AppText>
            <AppText variant="caption" numberOfLines={1}>{activeAllocations.length} batch(es)</AppText>
            <View style={styles.kpiTimeRow}>
              <View style={styles.kpiTimeCell}>
                <AppText variant="overline" faint numberOfLines={1}>Sold</AppText>
                <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit>
                  {soldFromSummary || totalSoldToday}
                </AppText>
              </View>
              <View style={styles.kpiTimeCell}>
                <AppText variant="overline" faint numberOfLines={1}>Left</AppText>
                <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit>
                  {remaining}
                </AppText>
              </View>
            </View>
          </Card>
        </View>

        <Card filled>
          <Pressable
            onPress={() => {
              if (!clockedIn && !clockedOut) {
                // Trigger the in-place clock-in mutation; the success state
                // falls back to the existing attendance refetch path.
                clockInMut.mutate();
                return;
              }
              // Already clocked in / out — drill into Attendance for detail.
              nav.navigate('Attendance');
            }}
            disabled={clockInMut.isPending}
          >
            <AppText variant="overline">Next step</AppText>
            <AppText variant="heading" style={styles.headingTop}>
              {clockInMut.isPending
                ? 'Clocking in…'
                : !clockedIn
                  ? 'Clock in to start your shift  ›'
                  : clockedOut
                    ? 'Shift done — review today'
                    : activeAllocated === 0
                      ? 'No active allocation today'
                      : `Sell ${activeAllocations[0]?.foodName ?? 'an item'}`}
            </AppText>
            {!clockedIn && !clockedOut ? (
              <AppText variant="caption" faint style={styles.mt4}>
                Tap to clock in. Or open Attendance to set notes.
              </AppText>
            ) : null}
          </Pressable>
        </Card>

        <SectionHeader
          label="Today’s allocated items"
          action={{ label: 'Sales →', onPress: () => nav.navigate('Sales') }}
        />

        {allocationQuery.isLoading ? (
          <Card>
            <AppText variant="caption">Loading today’s allocation…</AppText>
          </Card>
        ) : activeAllocations.length === 0 ? (
          <Card>
            <AppText variant="heading">Nothing to sell yet</AppText>
            <AppText variant="body" faint>
              Your admin hasn’t allocated anything for today. Once they do, each item will appear
              here with its own stepper.
            </AppText>
          </Card>
        ) : (
          <FlatList
            data={activeAllocations}
            keyExtractor={keyExtractor}
            renderItem={renderAllocation}
            scrollEnabled={false}
            ItemSeparatorComponent={Separator}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews
          />
        )}

        <SectionHeader label="Quick actions" />

        <View style={styles.actionsRow}>
          <ActionTile
            glyph={<Clock size={22} strokeWidth={1.5} />}
            label="Attendance"
            caption="Clock in / out"
            onPress={() => nav.navigate('Attendance')}
          />
          <ActionTile
            glyph={<Package size={22} strokeWidth={1.5} />}
            label="Stock"
            caption="Per-store inventory"
            onPress={() => nav.navigate('Inventory')}
          />
          <ActionTile
            glyph={<BookOpen size={22} strokeWidth={1.5} />}
            label="Recipes"
            caption="Prep reference"
            onPress={() => nav.navigate('Recipes')}
          />
          <ActionTile
            glyph={<TicketIcon size={22} strokeWidth={1.5} />}
            label="Tickets"
            caption="Tell admin"
            onPress={() => nav.navigate('Tickets')}
          />
          <ActionTile
            glyph={<TrendingUp size={22} strokeWidth={1.5} />}
            label="Reports"
            caption="Today & weekly"
            onPress={() => nav.navigate('Reports')}
          />
        </View>

        <Card>
          <SectionHeader
            label="Today so far"
            action={{ label: 'Reports →', onPress: () => nav.navigate('Reports') }}
          />
          <View style={styles.statRow}>
            <Metric label="Sales" value={String(todays.length)} />
            <Metric label="Units sold" value={String(totalSoldToday)} />
            <Metric label="Revenue" value={formatMoney(totalRevenueToday)} />
          </View>
        </Card>

        <Pressable
          onPress={() => nav.navigate('CloseShop')}
          style={({ pressed }) => [styles.closeCta, pressed ? styles.pressed : null]}
        >
          <View style={styles.closeRow}>
            <LogOut size={20} strokeWidth={1.5} />
            <AppText variant="heading">Close shop for the day</AppText>
          </View>
          <AppText variant="caption" style={styles.captionTop}>
            End your shift, confirm totals, and review what’s left.
          </AppText>
        </Pressable>

      {pendingLines.length > 0 ? (
        <View style={styles.commitBar} pointerEvents="box-none">
          <View style={styles.commitBarInner}>
            <View style={styles.commitText}>
              <AppText variant="caption" faint>
                Saving {pendingLines.length} sale(s)…
              </AppText>
            </View>
          </View>
        </View>
      ) : null}
    </AppScreen>
  );
}

export const HomeScreen = memo(HomeScreenImpl);

function Separator(): JSX.Element {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  sep: { height: 16 },

  // KPIs
  kpiRow: { flexDirection: 'row', gap: 14 },
  kpiTile: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 8,
  },
  kpiAccent: { backgroundColor: colors.accent },
  kpiTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  kpiTimeCell: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },

  // Quick actions
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 4,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },

  // Stepper
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  rowTitle: { flex: 1 },
  captionTop: { marginTop: 4 },
  metricTop: { marginTop: 6 },
  headingTop: { marginTop: 6 },
  chipTop: { marginTop: 10 },
  commitText: { flex: 1 },
  mt4: { marginTop: 4 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnAccent: { backgroundColor: colors.accent },
  stepperText: { color: colors.text, fontWeight: '900' },
  stepperTextInk: { color: colors.accentInk },
  stepperDisabled: { opacity: 0.35 },
  stepperDisplay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },

  // Today so far
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },

  // Close CTA
  closeCta: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 4,
  },
  closeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Commit bar
  commitBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
  },
  commitBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  pressed: { backgroundColor: colors.pressed },
});
