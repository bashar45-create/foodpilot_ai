import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';
import {
  createIngredient,
  deleteIngredient,
  getIngredient,
  listIngredients,
  listLowStock,
  updateIngredient,
  type CreateIngredientRequest,
  type Ingredient,
  type UpdateIngredientRequest,
} from '@/api/endpoints/ingredients';
import { adjustStock } from '@/api/endpoints/inventory';
import { analyticsKeys, inventoryKeys, storeInventoryKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export function useIngredients(params: { category?: string; lowStock?: boolean } = {}) {
  // Sync pushes live invalidations for the 'inventory' entity; only fall
  // back to 15s polling once SyncConnectionContext flags the connection as
  // down for long enough (see useSyncAwareRefetchInterval).
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: inventoryKeys.list(params),
    queryFn: () => listIngredients(params),
    refetchInterval,
  });
}

export function useIngredient(id: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: inventoryKeys.detail(id ?? ''),
    queryFn: () => getIngredient(id as string),
    enabled: Boolean(id),
    refetchInterval,
  });
}

export function useLowStockIngredients() {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: inventoryKeys.lowStock(),
    queryFn: () => listLowStock(),
    refetchInterval,
  });
}

export function useCreateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIngredientRequest) => createIngredient(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory', 'ingredients'] });
      qc.invalidateQueries({ queryKey: inventoryKeys.lowStock() });
    },
  });
}

export function useUpdateIngredient(id: string) {
  const qc = useQueryClient();
  // Hook kept for compatibility, but id is read from closure on each mutation call.
  // For dynamic ids, prefer useUpdateIngredientMutation.
  return useMutation({
    mutationFn: (input: UpdateIngredientRequest) => updateIngredient(id, input),
    onSuccess: (ingredient: Ingredient) => {
      qc.invalidateQueries({ queryKey: ['inventory', 'ingredients'] });
      qc.setQueryData(inventoryKeys.detail(ingredient.id), ingredient);
      qc.invalidateQueries({ queryKey: inventoryKeys.lowStock() });
    },
  });
}

/**
 * Mutation that takes the ingredient id at call time so the latest state value is always used.
 * Use this when the id is only known after the hook first mounts (e.g. from a sheet that opens later).
 */
export function useUpdateIngredientMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIngredientRequest }) => {
      if (!id) {
        return Promise.reject(new Error('Missing ingredient id'));
      }
      return updateIngredient(id, input);
    },
    onSuccess: (ingredient: Ingredient) => {
      // Patch every cached list so the row reflects the new stock immediately
      // without waiting for the refetch that the invalidation below triggers.
      qc.setQueriesData<Ingredient[] | undefined>(
        { queryKey: ['inventory', 'ingredients'] },
        (prev) =>
          prev
            ? prev.map((row) => (row.id === ingredient.id ? { ...row, ...ingredient } : row))
            : prev,
      );
      qc.invalidateQueries({ queryKey: ['inventory', 'ingredients'] });
      qc.setQueryData(inventoryKeys.detail(ingredient.id), ingredient);
      qc.invalidateQueries({ queryKey: inventoryKeys.lowStock() });
    },
  });
}

export function useDeleteIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteIngredient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory', 'ingredients'] });
      qc.invalidateQueries({ queryKey: inventoryKeys.lowStock() });
    },
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      ingredientId: string;
      quantity: number;
      reason: string;
      storeId?: string | null;
    }) => adjustStock(input),
    onSuccess: (result, variables) => {
      // Patch every cached list so the stock column updates instantly
      const updated = result.ingredient;
      qc.setQueriesData<Ingredient[] | undefined>(
        { queryKey: ['inventory', 'ingredients'] },
        (prev) =>
          prev
            ? prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row))
            : prev,
      );
      qc.invalidateQueries({ queryKey: ['inventory', 'ingredients'] });
      qc.setQueryData(inventoryKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: inventoryKeys.lowStock() });

      // Refresh per-store views so the StoreDetailSheet and low-stock toasts
      // reflect the new pool. Restock is a master-pool write today, so we
      // best-effort invalidate every cached store-inventory list + the
      // analytics store-summary view for the targeted store (if any).
      if (variables.storeId) {
        qc.invalidateQueries({ queryKey: storeInventoryKeys.list(variables.storeId) });
        qc.invalidateQueries({ queryKey: storeInventoryKeys.lowStock(variables.storeId) });
        qc.invalidateQueries({ queryKey: analyticsKeys.storeSummary(variables.storeId) });
      } else {
        qc.invalidateQueries({ queryKey: ['store-inventory'] });
        qc.invalidateQueries({ queryKey: ['analytics', 'store-summary'] });
      }
    },
  });
}