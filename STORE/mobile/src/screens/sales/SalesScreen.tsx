import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  ListRenderItem,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StatusChip } from '@/components/StatusChip';
import { BigButton } from '@/components/BigButton';
import { SectionHeader } from '@/components/Section';
import { AppText } from '@/lib/typography';
import { useAuth } from '@/context/AuthContext';
import {
  listSales,
  recordSale,
  type CreateSaleRequest,
  type Sale,
} from '@/api/endpoints/sales';
import {
  getStoreAllocationSummary,
  type Allocation,
} from '@/api/endpoints/allocations';
import { ApiException } from '@/types/api';
import { colors } from '@/lib/colors';
import { isToday, formatClockTime as fmtTime } from '@/lib/dates';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';
import { useToday } from '@/lib/use-today';

// ---------- Memoised list items ----------

const SaleRow = memo(function SaleRow({ sale }: { sale: Sale }): JSX.Element {
  const profit = Number(sale.profit ?? 0);
  return (
    <Card>
      <View style={styles.rowSpread}>
        <AppText variant="heading" style={styles.rowTitle} numberOfLines={1}>
          {sale.foodName}
        </AppText>
        <AppText variant="heading">{formatMoney(sale.totalPrice ?? 0)}</AppText>
      </View>
      <View style={styles.rowSpread}>
        <AppText variant="caption">×{sale.quantity} · {sale.channel} · {fmtTime(sale.createdAt)}</AppText>
        <AppText variant="body" faint>
          {formatSignedMoney(profit)} profit
        </AppText>
      </View>
    </Card>
  );
});

interface FoodTileProps {
  id: string;
  name: string;
  price: number;
  remaining: number;
  selected: boolean;
  onSelect: () => void;
}

const FoodTile = memo(function FoodTile({
  name,
  price,
  remaining,
  selected,
  onSelect,
}: FoodTileProps): JSX.Element {
  const disabled = remaining <= 0;
  return (
    <Pressable
      onPress={onSelect}
      disabled={disabled}
      style={({ pressed }) => [
        styles.foodCard,
        selected ? styles.foodCardSelected : null,
        disabled ? styles.foodCardDisabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <AppText variant="bodyBold" numberOfLines={1}>
        {name}
      </AppText>
      <AppText variant="heading" style={styles.tilePrice}>
        {formatMoney(price)}
      </AppText>
      <AppText variant="caption" style={styles.tileRemaining}>
        {remaining > 0 ? `${remaining} left` : 'sold out'}
      </AppText>
    </Pressable>
  );
});

// ---------- Screen ----------

function SalesScreenImpl(): JSX.Element {
  const { user } = useAuth();
  const qc = useQueryClient();
  const storeId = user?.assignedStore ?? '';
  const [composerOpen, setComposerOpen] = useState(false);
  const refetchInterval = useSyncAwareRefetchInterval();
  const today = useToday();

  // Day-rollover: today's "sales" and "allocations" filters must re-run, and
  // queries keyed by today must be refetched with the new date.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['allocations'] });
  }, [today, qc]);

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

  const activeAllocations = useMemo<Allocation[]>(
    () =>
      (allocationQuery.data?.allocations ?? []).filter(
        (a) => (a.status ?? '').toUpperCase() === 'ACTIVE',
      ),
    [allocationQuery.data],
  );

  const todays = useMemo<Sale[]>(
    () =>
      (salesQuery.data ?? []).filter((s) => isToday(s.createdAt ?? '', today)),
    [salesQuery.data, today],
  );

  const onRefresh = useCallback(() => {
    void salesQuery.refetch();
    void allocationQuery.refetch();
  }, [salesQuery, allocationQuery]);

  const renderSale: ListRenderItem<Sale> = useCallback(({ item }) => <SaleRow sale={item} />, []);
  const saleKey = useCallback((s: Sale) => s.id, []);

  const canSell = activeAllocations.length > 0;
  const isFetching = salesQuery.isFetching || allocationQuery.isFetching;

  return (
    <AppScreen
      title="Sales"
      subtitle={`${todays.length} sale(s) today`}
      onRefresh={onRefresh}
      refreshing={isFetching}
    >
      <Card>
        <SectionHeader label="Today’s sellable items" />
        {allocationQuery.isLoading ? (
          <AppText variant="body" faint>Loading allocations…</AppText>
        ) : canSell ? (
          <AppText variant="body" faint>
            {activeAllocations.length} food item(s) allocated today. The new-sale picker is scoped to these only.
          </AppText>
        ) : (
          <AppText variant="body" faint>
            No active allocation today — you can’t record new sales until your admin
            allocates food items to this store.
          </AppText>
        )}
      </Card>

      <BigButton
        label="+ New sale"
        caption="Tap to record one or many units of a food item"
        onPress={() => setComposerOpen(true)}
        disabled={!canSell || allocationQuery.isLoading}
      />

      <SectionHeader label="Today’s sales" />

      {salesQuery.isLoading ? (
        <Card>
          <AppText variant="caption">Loading today's sales…</AppText>
        </Card>
      ) : todays.length === 0 ? (
        <Card>
          <AppText variant="heading">No sales yet today</AppText>
          <AppText variant="body" faint>
            Tap “New sale” to record one. Stock deducts automatically.
          </AppText>
        </Card>
      ) : (
        <FlatList
          data={todays}
          keyExtractor={saleKey}
          renderItem={renderSale}
          ItemSeparatorComponent={SaleSeparator}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          scrollEnabled={false}
        />
      )}

      <SaleComposer
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        storeId={storeId}
        allocations={activeAllocations}
        todays={todays}
        onSubmitted={() => {
          qc.invalidateQueries({ queryKey: ['sales'] });
          qc.invalidateQueries({ queryKey: ['store-inventory'] });
          qc.invalidateQueries({ queryKey: ['allocations'] });
          setComposerOpen(false);
        }}
      />
    </AppScreen>
  );
}

export const SalesScreen = memo(SalesScreenImpl);

function SaleSeparator(): JSX.Element {
  return <View style={styles.sep12} />;
}

// ---------- Composer sheet ----------

interface SaleComposerProps {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  storeId: string;
  allocations: Allocation[];
  todays: Sale[];
}

function SaleComposer({
  visible,
  onClose,
  onSubmitted,
  storeId,
  allocations,
  todays,
}: SaleComposerProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const soldTodayByFood = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of todays) {
      map.set(s.foodItemId, (map.get(s.foodItemId) ?? 0) + Number(s.quantity ?? 0));
    }
    return map;
  }, [todays]);

  const items = useMemo(() => {
    return allocations.map((a) => {
      const soldToday = soldTodayByFood.get(a.foodItemId) ?? 0;
      const total = Number(a.quantity ?? 0);
      const remaining = Math.max(total - soldToday, 0);
      return {
        allocation: a,
        remaining,
        selected: selectedId === a.foodItemId,
        price: Number(a.unitPrice ?? 0),
      };
    });
  }, [allocations, soldTodayByFood, selectedId]);

  const selected = useMemo(() => items.find((i) => i.selected) ?? null, [items]);
  const maxForSelected = selected ? selected.remaining : 0;

  const mutation = useMutation({
    mutationFn: (input: CreateSaleRequest) => recordSale(input),
    onSuccess: () => {
      setSelectedId(null);
      setQuantity(1);
      onSubmitted();
    },
  });

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setQuantity(1);
      setError(null);
    },
    [],
  );

  const handleInc = useCallback(() => {
    setQuantity((q) => Math.min(maxForSelected, q + 1));
  }, [maxForSelected]);

  const handleDec = useCallback(() => {
    setQuantity((q) => Math.max(1, q - 1));
  }, []);

  const onChangeText = useCallback(
    (v: string) => {
      const n = Number(v.replace(/[^0-9]/g, '') || 1);
      setQuantity(Math.min(Math.max(1, n), Math.max(1, maxForSelected)));
    },
    [maxForSelected],
  );

  const submit = useCallback((): void => {
    if (!selected || !storeId) {
      setError('Pick a food item and ensure you are assigned to a store.');
      return;
    }
    if (quantity > selected.remaining) {
      setError(`Only ${selected.remaining} of "${selected.allocation.foodName ?? 'this item'}" left today.`);
      return;
    }
    setError(null);
    mutation.mutate({
      storeId,
      foodItemId: selected.allocation.foodItemId,
      quantity,
      channel: 'POS',
    });
  }, [selected, storeId, quantity, mutation]);

  const renderFood: ListRenderItem<typeof items[number]> = useCallback(
    ({ item }) => (
      <FoodTile
        id={item.allocation.foodItemId}
        name={item.allocation.foodName ?? 'Item'}
        price={item.price}
        remaining={item.remaining}
        selected={item.selected}
        onSelect={() => select(item.allocation.foodItemId)}
      />
    ),
    [select],
  );
  const foodKey = useCallback(
    (row: typeof items[number]) => row.allocation.id || row.allocation.foodItemId,
    [],
  );
  const foodSeparator = useCallback(() => <View style={styles.sep10} />, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <AppText variant="title">New sale</AppText>
          <AppText variant="body" faint>
            Only food items allocated to your store today can be sold.
          </AppText>

          {items.length === 0 ? (
            <AppText variant="body" faint>
              No allocations for today. Ask your admin to allocate food items first.
            </AppText>
          ) : (
            <FlatList
              data={items}
              keyExtractor={foodKey}
              renderItem={renderFood}
              numColumns={2}
              columnWrapperStyle={styles.foodColumn}
              ItemSeparatorComponent={foodSeparator}
              contentContainerStyle={styles.foodList}
              style={styles.foodScroll}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              windowSize={5}
            />
          )}

          <View style={styles.qtyRow}>
            <AppText variant="overline">Quantity</AppText>
            <View style={styles.qtyControls}>
              <Pressable
                style={({ pressed }) => [styles.qtyBtn, pressed ? styles.pressed : null]}
                onPress={handleDec}
                disabled={!selected}
              >
                <AppText variant="title">−</AppText>
              </Pressable>
              <TextInput
                value={String(quantity)}
                onChangeText={onChangeText}
                keyboardType="number-pad"
                editable={Boolean(selected)}
                style={styles.qtyInput}
              />
              <Pressable
                style={({ pressed }) => [styles.qtyBtn, pressed ? styles.pressed : null]}
                onPress={handleInc}
                disabled={!selected}
              >
                <AppText variant="title">+</AppText>
              </Pressable>
            </View>
          </View>

          {selected ? (
            <AppText variant="body">
              {quantity} × {selected.allocation.foodName ?? 'item'} = {formatMoney(quantity * selected.price)}
              {maxForSelected > 0 ? `  ·  max ${maxForSelected}` : ''}
            </AppText>
          ) : null}

          {error ? <AppText variant="body" style={styles.error}>{error}</AppText> : null}
          {mutation.error instanceof ApiException ? (
            <AppText variant="body" style={styles.error}>{mutation.error.message}</AppText>
          ) : null}

          <View style={styles.sheetActions}>
            <PrimaryButton label="Cancel" variant="outline" onPress={onClose} />
            <PrimaryButton
              label={mutation.isPending ? 'Submitting…' : 'Record sale'}
              onPress={submit}
              disabled={mutation.isPending || !selected || maxForSelected <= 0}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rowSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: { flex: 1 },
  sep10: { height: 10 },
  sep12: { height: 12 },
  tilePrice: { marginTop: 4 },
  tileRemaining: { marginTop: 4 },

  foodScroll: { maxHeight: 320 },
  foodList: { gap: 10 },
  foodColumn: { gap: 10 },
  foodCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 4,
  },
  foodCardSelected: { backgroundColor: colors.accent },
  foodCardDisabled: { opacity: 0.4 },
  pressed: { backgroundColor: colors.pressed },

  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    minWidth: 60,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    padding: 22,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderColor: colors.border,
    gap: 14,
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  error: { color: colors.text },
});
