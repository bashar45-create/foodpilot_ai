import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  getRecipeCost,
  listRecipes,
  updateRecipe,
  type CreateRecipeRequest,
  type Recipe,
  type UpdateRecipeRequest,
} from '@/api/endpoints/recipes';
import { recipeKeys } from '@/api/queryKeys';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export function useRecipes() {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: recipeKeys.list({}),
    queryFn: () => listRecipes(),
    refetchInterval,
  });
}

export function useRecipe(id: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: recipeKeys.detail(id ?? ''),
    queryFn: () => getRecipe(id as string),
    enabled: Boolean(id),
    refetchInterval,
  });
}

export function useRecipeCost(id: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: recipeKeys.cost(id ?? ''),
    queryFn: () => getRecipeCost(id as string),
    enabled: Boolean(id),
    refetchInterval,
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecipeRequest) => createRecipe(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useUpdateRecipe(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRecipeRequest) => updateRecipe(id, input),
    onSuccess: (recipe: Recipe) => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.setQueryData(recipeKeys.detail(recipe.id), recipe);
    },
  });
}

/**
 * Mutation that takes the recipe id at call time so the latest state value is always used.
 * Use this when the id is only known after the hook first mounts (e.g. from a dialog that opens later).
 */
export function useUpdateRecipeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRecipeRequest }) => {
      if (!id) {
        return Promise.reject(new Error('Missing recipe id'));
      }
      return updateRecipe(id, input);
    },
    onSuccess: (recipe: Recipe) => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.setQueryData(recipeKeys.detail(recipe.id), recipe);
    },
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecipe(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}