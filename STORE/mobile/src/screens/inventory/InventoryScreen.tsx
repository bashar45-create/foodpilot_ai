import { memo, useCallback, useEffect } from 'react';
import { AppState, FlatList, ListRenderItem, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StatusChip } from '@/components/StatusChip';
import { Metric } from '@/components/Section';
import { useAuth } from '@/context/AuthContext';
import { getStoreNeedsToday, type StoreNeedsTodayRow } from '@/api/endpoints/storeInventory';
import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

interface InventoryScreenProps {
  onOpenTodaysAllocation?: () => void;
}

const IngredientRow = memo(function IngredientRow({
  row,
}: {
  row: StoreNeedsTodayRow;
}): JSX.Element {
  const need = Number(row.required ?? 0);
  const have = Number(row.storeHas ?? 0);
  const shortfall = Number(row.shortfall ?? Math.max(need - have, 0));
  const unit = row.unit ?? '';
  const covered = shortfall <= 0;
  const empty = have <= 0;
  return (
    <Card>
      <View style={styles.rowSpread}>
        <AppText variant="heading" style={styles.rowTitle} numberOfLines={1}>
          {row.ingredientName ?? row.ingredientId}
        </AppText>
        <StatusChip
          tone={empty ? 'accent' : covered ? 'solid' : 'plain'}
          label={empty ? 'EMPTY' : covered ? 'COVERED' : 'SHORT'}
        />
      </View>
      <View style={styles.rowSpread}>
        <View>
          <AppText variant="overline" faint>Need to make</AppText>
          <AppText variant="heading">{need.toFixed(2)} {unit}</AppText>
        </View>
        <View>
          <AppText variant="overline" faint>On shelf</AppText>
          <AppText variant="heading">{have.toFixed(2)} {unit}</AppText>
        </View>
        <View>
          <AppText variant="overline" faint>Shortfall</AppText>
          <AppText variant="heading">{shortfall.toFixed(2)} {unit}</AppText>
        </View>
      </View>
    </Card>
  );
});

function InventoryScreenImpl({
  onOpenTodaysAllocation,
}: InventoryScreenProps = {}): JSX.Element {
  const { user } = useAuth();
  const storeId = user?.assignedStore ?? '';
  const qc = useQueryClient();
  // Live sync now invalidates ['store-needs-today'] on 'inventory' events, so
  // this only needs to poll on a 30 s cadence as a fallback baseline while
  // the connection is healthy — useSyncAwareRefetchInterval steps that up to
  // the shared 15 s cadence once the live connection has been down long
  // enough to trip the polling fallback.
  const refetchInterval = useSyncAwareRefetchInterval(30_000);

  const needsQuery = useQuery({
    queryKey: ['store-needs-today', storeId],
    queryFn: () => getStoreNeedsToday(storeId),
    enabled: Boolean(storeId),
    // Refetch when the app returns to the foreground so workers don't have
    // to pull-to-refresh manually, and force a refetch on every mount so the
    // AsyncStorage-cached previous-session response can't lie to the worker.
    refetchInterval,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Refetch whenever the app becomes active again (covers the common
  // pattern: worker backgrounds the app, admin allocates on the web, worker
  // re-opens the app and expects today's stock to be up to date).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void qc.invalidateQueries({ queryKey: ['store-needs-today', storeId] });
      }
    });
    return () => sub.remove();
  }, [qc, storeId]);

  const rows = needsQuery.data ?? [];
  const shortCount = rows.filter((r) => Number(r.shortfall ?? 0) > 0).length;

  const onRefresh = useCallback(() => {
    void needsQuery.refetch();
  }, [needsQuery]);

  const renderRow: ListRenderItem<StoreNeedsTodayRow> = useCallback(
    ({ item }) => <IngredientRow row={item} />,
    [],
  );
  const keyExtractor = useCallback(
    (row: StoreNeedsTodayRow) => String(row.ingredientId),
    [],
  );
  const separator = useCallback(() => <View style={styles.sep12} />, []);

  return (
    <AppScreen
      title="Today's stock"
      subtitle="Ingredients you need to make today's allocated food."
      onRefresh={onRefresh}
      refreshing={needsQuery.isFetching}
    >
      <Card>
        <View style={styles.rowSpread}>
          <Metric label="Ingredients" value={String(rows.length)} />
          <Metric label="Short on shelf" value={String(shortCount)} />
        </View>
        {shortCount > 0 ? (
          <StatusChip
            tone="accent"
            label={`${shortCount} ingredient(s) below what you need to make today`}
          />
        ) : rows.length > 0 ? (
          <StatusChip tone="solid" label="You're covered for today's allocation" />
        ) : null}
      </Card>

      <PrimaryButton
        label="Today's allocation"
        caption="See what was allocated today, what you've used, what's left."
        onPress={onOpenTodaysAllocation ?? (() => undefined)}
      />

      {needsQuery.isLoading ? (
        <Card>
          <AppText variant="caption">Loading today's needs…</AppText>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <AppText variant="heading">No active allocations for today</AppText>
          <AppText variant="body" faint>
            Once your manager allocates food items to this store for today, the
            ingredients you need to make them will show up here.
          </AppText>
          {storeId ? (
            <AppText variant="caption" faint style={styles.mt8}>
              Logged-in store id: {storeId}
            </AppText>
          ) : (
            <AppText variant="caption" faint style={styles.mt8}>
              No store is assigned to your account. Ask your admin to set one
              in Users &raquo; Edit.
            </AppText>
          )}
        </Card>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={keyExtractor}
          renderItem={renderRow}
          ItemSeparatorComponent={separator}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          scrollEnabled={false}
        />
      )}
    </AppScreen>
  );
}

export const InventoryScreen = memo(InventoryScreenImpl);

const styles = StyleSheet.create({
  rowSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTitle: { flex: 1 },
  sep12: { height: 12 },
  mt8: { marginTop: 8 },
});