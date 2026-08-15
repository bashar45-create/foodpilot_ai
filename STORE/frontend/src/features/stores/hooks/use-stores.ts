import { useMutation, useQuery, useQueryClient } from '@/lib/query-helpers';
import { storeKeys } from '@/api/queryKeys';
import { apiClient } from '@/api/client';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export type StoreType = 'RETAIL' | 'FOOD' | 'WAREHOUSE' | 'KITCHEN';

export interface Store {
  id: string;
  businessId?: string;
  name: string;
  type?: StoreType;
  code?: string;
  address?: string;
  city?: string;
  phone?: string;
  isActive?: boolean;
  openingTime?: string;
  closingTime?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateStoreRequest {
  name: string;
  type?: StoreType;
  code?: string;
  address?: string;
  city?: string;
  phone?: string;
  isActive?: boolean;
  openingTime?: string;
  closingTime?: string;
}

export interface UpdateStoreRequest {
  name?: string;
  type?: StoreType;
  code?: string;
  address?: string;
  city?: string;
  phone?: string;
  isActive?: boolean;
  openingTime?: string;
  closingTime?: string;
}

export function listStores(): Promise<Store[]> {
  return apiClient.get('/api/v1/stores');
}

export function getStore(id: string): Promise<Store> {
  return apiClient.get(`/api/v1/stores/${id}`);
}

export function createStore(input: CreateStoreRequest): Promise<Store> {
  return apiClient.post('/api/v1/stores', input);
}

export function updateStore(id: string, input: UpdateStoreRequest): Promise<Store> {
  return apiClient.put(`/api/v1/stores/${id}`, input);
}

export function setStoreStatus(id: string, isActive: boolean): Promise<Store> {
  return apiClient.patch(`/api/v1/stores/${id}/status`, { isActive });
}

export function deleteStore(id: string): Promise<{ deleted: boolean }> {
  return apiClient.delete(`/api/v1/stores/${id}`);
}

export function useStores() {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: storeKeys.list({}),
    queryFn: () => listStores(),
    refetchInterval,
  });
}

export function useStore(id: string | undefined) {
  const refetchInterval = useSyncAwareRefetchInterval();
  return useQuery({
    queryKey: storeKeys.detail(id ?? ''),
    queryFn: () => getStore(id as string),
    enabled: Boolean(id),
    refetchInterval,
  });
}

export function useCreateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStoreRequest) => createStore(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] });
    },
  });
}

export function useUpdateStore(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStoreRequest) => updateStore(id, input),
    onSuccess: (store: Store) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      qc.setQueryData(storeKeys.detail(store.id), store);
    },
  });
}

/**
 * Mutation that takes the store id at call time so the latest state value is always used.
 * Use this when the id is only known after the hook first mounts (e.g. from a dialog that opens later).
 */
export function useUpdateStoreMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStoreRequest }) => {
      if (!id) {
        return Promise.reject(new Error('Missing store id'));
      }
      return updateStore(id, input);
    },
    onSuccess: (store: Store) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      qc.setQueryData(storeKeys.detail(store.id), store);
    },
  });
}

export function useSetStoreStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setStoreStatus(id, isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] });
    },
  });
}

export function useDeleteStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteStore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] });
    },
  });
}

// Re-export the store summary hook so feature pages can import it next to useStores.
export { useStoreSummary } from '@/features/analytics/hooks/use-analytics';