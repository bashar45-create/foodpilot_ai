import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';
import {
  createFood,
  deleteFood,
  getFood,
  listFood,
  recalculateFoodCost,
  updateFood,
  type CreateFoodRequest,
  type FoodItem,
  type UpdateFoodRequest,
} from '@/api/endpoints/food';
import { foodKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export function useFood() {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: foodKeys.list({}),
    queryFn: () => listFood(),
    refetchInterval,
  });
}

export function useFoodItem(id: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: foodKeys.detail(id ?? ''),
    queryFn: () => getFood(id as string),
    enabled: Boolean(id),
    refetchInterval,
  });
}

export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFoodRequest) => createFood(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food'] });
    },
  });
}

export function useUpdateFood(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateFoodRequest) => updateFood(id, input),
    onSuccess: (food: FoodItem) => {
      qc.invalidateQueries({ queryKey: ['food'] });
      qc.setQueryData(foodKeys.detail(food.id), food);
    },
  });
}

/**
 * Mutation that takes the food id at call time so the latest state value is always used.
 * Use this when the id is only known after the hook first mounts (e.g. from a dialog that opens later).
 */
export function useUpdateFoodMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFoodRequest }) => {
      if (!id) {
        return Promise.reject(new Error('Missing food id'));
      }
      return updateFood(id, input);
    },
    onSuccess: (food: FoodItem) => {
      qc.invalidateQueries({ queryKey: ['food'] });
      qc.setQueryData(foodKeys.detail(food.id), food);
    },
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFood(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food'] });
    },
  });
}

export function useRecalculateFoodCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => recalculateFoodCost(id),
    onSuccess: (food: FoodItem) => {
      qc.invalidateQueries({ queryKey: ['food'] });
      qc.setQueryData(foodKeys.detail(food.id), food);
    },
  });
}