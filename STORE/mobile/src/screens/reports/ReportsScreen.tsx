import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { StatusChip } from '@/components/StatusChip';
import { Metric } from '@/components/Section';
import { useAuth } from '@/context/AuthContext';
import { listSales, type Sale } from '@/api/endpoints/sales';
import { AppText } from '@/lib/typography';
import { colors } from '@/lib/colors';
import { isInDateRange, type DateRange } from '@/lib/dates';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';
import { useToday } from '@/lib/use-today';

type Range = DateRange;

interface PerFood {
  id: string;
  name: string;
  units: number;
  revenue: number;
  profit: number;
}

interface FoodBreakdownRowProps {
  row: PerFood;
  share: number;
}

const FoodBreakdownRow = memo(function FoodBreakdownRow({
  row,
  share,
}: FoodBreakdownRowProps): JSX.Element {
  const widthPct = Math.max(8, Math.round(share * 100));
  return (
    <View style={styles.foodRow}>
      <View style={styles.foodHeader}>
        <AppText variant="bodyBold" style={styles.rowTitle} numberOfLines={1}>
          {row.name}
        </AppText>
        <StatusChip
          label={`${row.units} ×`}
          tone={row.profit >= 0 ? 'solid' : 'danger'}
        />
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${widthPct}%` }]} />
      </View>
      <View style={styles.foodMetaRow}>
        <AppText variant="caption">{formatMoney(row.revenue)} rev</AppText>
        <AppText variant="caption">{formatSignedMoney(row.profit)}</AppText>
      </View>
    </View>
  );
});

interface RangeChipProps {
  value: Range;
  selected: boolean;
  label: string;
  onPress: (next: Range) => void;
}

const RangeChip = memo(function RangeChip({
  value,
  selected,
  label,
  onPress,
}: RangeChipProps): JSX.Element {
  return (
    <Pressable
      onPress={() => onPress(value)}
      style={[styles.rangeChip, selected ? styles.rangeChipActive : null]}
    >
      <AppText variant="overline" style={selected ? styles.rangeChipTextActive : null}>
        {label}
      </AppText>
    </Pressable>
  );
});

function ReportsScreenImpl(): JSX.Element {
  const { user } = useAuth();
  const qc = useQueryClient();
  const storeId = user?.assignedStore ?? '';
  const [range, setRange] = useState<Range>('today');
  const today = useToday();
  const refetchInterval = useSyncAwareRefetchInterval();

  // Day-rollover: "today" filter must re-run, and the sales query must
  // re-fetch against the new date if the user keeps the app open across
  // midnight.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['sales'] });
  }, [today, qc]);

  const salesQuery = useQuery({
    queryKey: ['sales', 'store', storeId],
    queryFn: () => listSales(storeId || undefined),
    enabled: Boolean(storeId),
    staleTime: 30_000,
    refetchInterval,
  });

  const filtered: Sale[] = useMemo(
    () => (salesQuery.data ?? []).filter((s) => isInDateRange(s.createdAt ?? '', range, today)),
    [salesQuery.data, range, today],
  );

  const totals = useMemo(() => {
    const totalUnits = filtered.reduce((s, x) => s + Number(x.quantity ?? 0), 0);
    const totalRevenue = filtered.reduce((s, x) => s + Number(x.totalPrice ?? 0), 0);
    const totalProfit = filtered.reduce((s, x) => s + Number(x.profit ?? 0), 0);
    const totalCost = filtered.reduce((s, x) => s + Number(x.totalCost ?? 0), 0);
    const distinctItems = new Set(filtered.map((x) => x.foodItemId)).size;
    return { totalUnits, totalRevenue, totalProfit, totalCost, distinctItems };
  }, [filtered]);

  const perFood: PerFood[] = useMemo(() => {
    const map = new Map<
      string,
      { name: string; units: number; revenue: number; profit: number }
    >();
    for (const s of filtered) {
      const id = s.foodItemId || 'unknown';
      const existing = map.get(id) ?? {
        name: s.foodName || 'Item',
        units: 0,
        revenue: 0,
        profit: 0,
      };
      existing.units += Number(s.quantity ?? 0);
      existing.revenue += Number(s.totalPrice ?? 0);
      existing.profit += Number(s.profit ?? 0);
      map.set(id, existing);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.units - a.units);
  }, [filtered]);

  const peakUnits = perFood.length > 0 ? perFood[0].units : 0;

  const onRefresh = useCallback(() => {
    void salesQuery.refetch();
  }, [salesQuery]);

  const onSelectRange = useCallback((next: Range) => setRange(next), []);

  const subtitle =
    range === 'today'
      ? `Today · ${new Date().toDateString()}`
      : 'Last 7 days · includes today';

  const renderFood: ListRenderItem<PerFood> = useCallback(
    ({ item }) => (
      <FoodBreakdownRow
        row={item}
        share={peakUnits > 0 ? item.units / peakUnits : 0}
      />
    ),
    [peakUnits],
  );
  const foodKey = useCallback((row: PerFood) => row.id, []);
  const foodSeparator = useCallback(() => <View style={styles.sep10} />, []);

  return (
    <AppScreen
      title="Reports"
      subtitle={subtitle}
      onRefresh={onRefresh}
      refreshing={salesQuery.isFetching}
    >
      <View style={styles.rangeRow}>
        <RangeChip value="today" selected={range === 'today'} label="Today" onPress={onSelectRange} />
        <RangeChip value="week" selected={range === 'week'} label="This week" onPress={onSelectRange} />
      </View>

      <Card>
        <AppText variant="overline">
          {range === 'today' ? 'Today' : 'Last 7 days'} — summary
        </AppText>
        <View style={styles.metricsRow}>
          <Metric label="Sales" value={String(filtered.length)} />
          <Metric label="Units" value={String(totals.totalUnits)} />
          <Metric label="Items" value={String(totals.distinctItems)} />
        </View>
        <View style={styles.metricsRow}>
          <Metric label="Revenue" value={formatMoney(totals.totalRevenue)} />
          <Metric label="Profit" value={formatSignedMoney(totals.totalProfit)} />
          <Metric label="Cost" value={formatMoney(totals.totalCost)} />
        </View>
      </Card>

      <Card>
        <AppText variant="overline">Per food item</AppText>
        {salesQuery.isLoading ? (
          <AppText variant="body" faint>Loading sales…</AppText>
        ) : perFood.length === 0 ? (
          <AppText variant="body" faint>
            {range === 'today'
              ? 'No sales recorded today yet. Record a sale from Home or the Sales tab.'
              : 'No sales in the last 7 days for your store.'}
          </AppText>
        ) : (
          <FlatList
            data={perFood}
            keyExtractor={foodKey}
            renderItem={renderFood}
            ItemSeparatorComponent={foodSeparator}
            scrollEnabled={false}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews
          />
        )}
      </Card>

      <Card>
        <AppText variant="overline">Notes</AppText>
        <AppText variant="body" faint>
          Reports are computed from the sales recorded for your assigned store.
          Use the range chips above to switch between today’s and the last 7 days
          of activity. Managers review the same numbers from the web dashboard.
        </AppText>
      </Card>
    </AppScreen>
  );
}

export const ReportsScreen = memo(ReportsScreenImpl);

const styles = StyleSheet.create({
  rangeRow: { flexDirection: 'row', gap: 8 },
  rowTitle: { flex: 1 },
  sep10: { height: 10 },
  rangeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  rangeChipActive: {
    backgroundColor: colors.accent,
  },
  rangeChipTextActive: { color: colors.accentInk },

  metricsRow: { flexDirection: 'row', gap: 12 },

  foodRow: { gap: 6 },
  foodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.accent },
  foodMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});