import { memo, useCallback, useEffect, useMemo } from 'react';
import { Alert, FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StatusChip } from '@/components/StatusChip';
import { Metric } from '@/components/Section';
import { useAuth } from '@/context/AuthContext';
import {
  clockOut,
  getAttendanceToday,
  type AttendanceRecord,
} from '@/api/endpoints/attendance';
import { listSales, type Sale } from '@/api/endpoints/sales';
import {
  getStoreAllocationSummary,
  type Allocation,
} from '@/api/endpoints/allocations';
import { getStoreLowStock, getStoreInventory } from '@/api/endpoints/storeInventory';
import { AppText } from '@/lib/typography';
import { colors } from '@/lib/colors';
import { formatClockTime as fmt, isToday } from '@/lib/dates';
import { useToday } from '@/lib/use-today';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

interface AllocationRowProps {
  allocation: Allocation;
}

const AllocationRow = memo(function AllocationRow({
  allocation,
}: AllocationRowProps): JSX.Element {
  const quantity = Number(allocation.quantity ?? 0);
  const sold = Number(allocation.sold ?? 0);
  const remaining = Number(allocation.remaining ?? 0);
  return (
    <View style={styles.allocationLine}>
      <AppText variant="bodyBold" numberOfLines={1} style={styles.rowTitle}>
        {allocation.foodName ?? allocation.foodItemId}
      </AppText>
      <AppText variant="caption">
        {quantity.toFixed(0)}u · sold {sold.toFixed(0)} · left {remaining.toFixed(0)}
      </AppText>
    </View>
  );
});

interface LowStockRowProps {
  name: string;
  qty: number;
  unit: string;
  min: number;
}

const LowStockRow = memo(function LowStockRow({
  name,
  qty,
  unit,
  min,
}: LowStockRowProps): JSX.Element {
  return (
    <View style={styles.allocationLine}>
      <AppText variant="bodyBold" numberOfLines={1} style={styles.rowTitle}>
        {name}
      </AppText>
      <AppText variant="caption">
        {qty.toFixed(2)} {unit} · min {min.toFixed(2)}
      </AppText>
    </View>
  );
});

function CloseShopScreenImpl(): JSX.Element {
  const { user } = useAuth();
  const qc = useQueryClient();
  const storeId = user?.assignedStore ?? '';
  const today = useToday();

  // Day-rollover: refresh caches so a long-running session shows today's
  // totals, not yesterday's.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['attendance'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['allocations'] });
    qc.invalidateQueries({ queryKey: ['store-inventory'] });
  }, [today, qc]);

  const refetchInterval = useSyncAwareRefetchInterval();

  const attendanceQuery = useQuery({
    queryKey: ['attendance', 'today', user?.userId ?? ''],
    queryFn: getAttendanceToday,
    refetchInterval,
  });

  const salesQuery = useQuery({
    queryKey: ['sales', 'store', storeId],
    queryFn: () => listSales(storeId || undefined),
    enabled: Boolean(storeId),
    refetchInterval,
  });

  const allocationQuery = useQuery({
    queryKey: ['allocations', 'summary', storeId, today],
    queryFn: () => getStoreAllocationSummary(storeId, { start: today, end: today }),
    enabled: Boolean(storeId),
    refetchInterval,
  });

  const inventoryQuery = useQuery({
    queryKey: ['store-inventory', storeId],
    queryFn: () => getStoreInventory(storeId),
    enabled: Boolean(storeId),
    refetchInterval,
  });

  const lowStockQuery = useQuery({
    queryKey: ['store-low-stock', storeId],
    queryFn: () => getStoreLowStock(storeId),
    enabled: Boolean(storeId),
    refetchInterval,
  });

  const todays: Sale[] = useMemo(
    () => (salesQuery.data ?? []).filter((s) => isToday(s.createdAt ?? '', today)),
    [salesQuery.data, today],
  );

  const totals = useMemo(() => {
    const revenue = todays.reduce((sum, s) => sum + Number(s.totalPrice ?? 0), 0);
    const profit = todays.reduce((sum, s) => sum + Number(s.profit ?? 0), 0);
    const units = todays.reduce((sum, s) => sum + Number(s.quantity ?? 0), 0);
    const items = new Set(todays.map((s) => s.foodItemId)).size;
    return { revenue, profit, units, items };
  }, [todays]);

  const allocations: Allocation[] = useMemo(
    () => allocationQuery.data?.allocations ?? [],
    [allocationQuery.data],
  );

  const allocationUnitsLeft = useMemo(
    () =>
      allocations.reduce((sum, a) => sum + Math.max(0, Number(a.remaining ?? 0)), 0),
    [allocations],
  );

  const attendance: AttendanceRecord | null = useMemo(() => {
    if (attendanceQuery.data && (attendanceQuery.data as AttendanceRecord).status) {
      return attendanceQuery.data as AttendanceRecord;
    }
    return null;
  }, [attendanceQuery.data]);

  const inventoryRows = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data]);
  const lowStockList = useMemo(() => lowStockQuery.data ?? [], [lowStockQuery.data]);

  const clockOutMut = useMutation({
    mutationFn: () => clockOut(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      Alert.alert('Shift closed', 'You are clocked out for the day.');
    },
  });

  const onRefresh = useCallback(() => {
    void attendanceQuery.refetch();
    void salesQuery.refetch();
    void allocationQuery.refetch();
    void inventoryQuery.refetch();
    void lowStockQuery.refetch();
  }, [attendanceQuery, salesQuery, allocationQuery, inventoryQuery, lowStockQuery]);

  const isFetching =
    attendanceQuery.isFetching ||
    salesQuery.isFetching ||
    allocationQuery.isFetching ||
    inventoryQuery.isFetching ||
    lowStockQuery.isFetching;

  const clockedIn = Boolean(attendance?.clockIn);
  const clockedOut = Boolean(attendance?.clockOut);

  const shiftTone = clockedOut ? 'solid' : clockedIn ? 'accent' : 'plain';
  const shiftLabel = clockedOut ? 'CLOSED' : clockedIn ? 'ON SHIFT' : 'NOT STARTED';

  const onClockOut = useCallback(() => clockOutMut.mutate(), [clockOutMut]);

  const visibleAllocations = useMemo(() => allocations.slice(0, 6), [allocations]);
  const visibleLowStock = useMemo(() => lowStockList.slice(0, 5), [lowStockList]);

  const renderAllocation: ListRenderItem<Allocation> = useCallback(
    ({ item }) => <AllocationRow allocation={item} />,
    [],
  );
  const allocationKey = useCallback((a: Allocation) => a.id, []);

  const renderLowStock: ListRenderItem<(typeof lowStockList)[number]> = useCallback(
    ({ item }) => (
      <LowStockRow
        name={item.ingredientName ?? item.ingredientId}
        qty={Number(item.quantity ?? 0)}
        unit={item.unit ?? ''}
        min={Number(item.minimumStock ?? 0)}
      />
    ),
    [],
  );
  const lowStockKey = useCallback(
    (row: (typeof lowStockList)[number]) => `${row.storeId}-${row.ingredientId}`,
    [],
  );

  return (
    <AppScreen
      title="Close shop"
      subtitle={`End-of-day review for ${new Date().toDateString()}`}
      onRefresh={onRefresh}
      refreshing={isFetching}
    >
      <Card>
        <View style={styles.rowSpread}>
          <AppText variant="overline">Shift</AppText>
          <StatusChip tone={shiftTone} label={shiftLabel} />
        </View>
        <View style={styles.timeGrid}>
          <View style={styles.timeCell}>
            <AppText variant="overline" faint>Clock in</AppText>
            <AppText variant="metric" style={styles.metricTop}>{fmt(attendance?.clockIn)}</AppText>
          </View>
          <View style={styles.timeCell}>
            <AppText variant="overline" faint>Clock out</AppText>
            <AppText variant="metric" style={styles.metricTop}>{fmt(attendance?.clockOut)}</AppText>
          </View>
        </View>
        {clockedOut ? (
          <AppText variant="caption">You’re already clocked out for the day.</AppText>
        ) : (
          <PrimaryButton
            label={
              clockOutMut.isPending
                ? 'Closing…'
                : clockedIn
                  ? 'Clock out & close shop'
                  : 'Clock in, then close (cannot close without a shift)'
            }
            onPress={onClockOut}
            disabled={clockOutMut.isPending || !clockedIn}
          />
        )}
        {!clockedIn && !clockedOut ? (
          <AppText variant="caption">
            You need to clock in for the day before you can close the shop.
          </AppText>
        ) : null}
      </Card>

      <Card>
        <AppText variant="overline">Today’s sales</AppText>
        <View style={styles.metricsRow}>
          <Metric label="Sales" value={String(todays.length)} />
          <Metric label="Units" value={String(totals.units)} />
          <Metric label="Items" value={String(totals.items)} />
        </View>
        <View style={styles.metricsRow}>
          <Metric label="Revenue" value={formatMoney(totals.revenue)} />
          <Metric label="Profit" value={formatSignedMoney(totals.profit)} />
        </View>
      </Card>

      <Card>
        <AppText variant="overline">Allocations</AppText>
        {allocations.length === 0 ? (
          <AppText variant="body" faint>
            No allocations recorded today. Ask your manager before wrapping up.
          </AppText>
        ) : (
          <>
            <View style={styles.metricsRow}>
              <Metric label="Batches" value={String(allocations.length)} />
              <Metric label="Units left" value={String(allocationUnitsLeft)} />
            </View>
            <FlatList
              data={visibleAllocations}
              keyExtractor={allocationKey}
              renderItem={renderAllocation}
              ItemSeparatorComponent={AllocationSeparator}
              scrollEnabled={false}
            />
          </>
        )}
      </Card>

      <Card>
        <AppText variant="overline">Stock check</AppText>
        {inventoryRows.length === 0 ? (
          <AppText variant="body" faint>No ingredients stocked at this store.</AppText>
        ) : (
          <View style={styles.metricsRow}>
            <Metric label="Ingredients" value={String(inventoryRows.length)} />
            <Metric
              label="Low stock"
              value={String(lowStockList.length)}
            />
          </View>
        )}
        {lowStockList.length > 0 ? (
          <>
            <StatusChip tone="danger" label={`${lowStockList.length} ingredient${lowStockList.length === 1 ? '' : 's'} low`} />
            <FlatList
              data={visibleLowStock}
              keyExtractor={lowStockKey}
              renderItem={renderLowStock}
              ItemSeparatorComponent={AllocationSeparator}
              scrollEnabled={false}
            />
          </>
        ) : null}
      </Card>

      <Card>
        <AppText variant="overline">Reminder</AppText>
        <AppText variant="body" faint>
          Closing the shop only clocks you out — it does not delete any sales or
          allocations. Managers review the day using the web reports.
        </AppText>
      </Card>
    </AppScreen>
  );
}

function AllocationSeparator(): JSX.Element {
  return <View style={styles.sep} />;
}

export const CloseShopScreen = memo(CloseShopScreenImpl);

const styles = StyleSheet.create({
  rowSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timeGrid: { flexDirection: 'row', gap: 12 },
  timeCell: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  metricsRow: { flexDirection: 'row', gap: 12 },
  metricTop: { marginTop: 6 },
  sep: { height: 6 },
  rowTitle: { flex: 1 },
  allocationLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
});