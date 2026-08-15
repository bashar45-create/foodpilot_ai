import { useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import { useStores } from '@/features/stores/hooks/use-stores';

/**
 * Resolves the "active" store for the current user.
 * Priority: user.assignedStore → first store from /api/v1/stores.
 */
export function useActiveStore(): { storeId: string | null; isLoading: boolean } {
  const { user } = useAuth();
  const { data: stores, isLoading } = useStores();
  return useMemo(() => {
    if (isLoading) return { storeId: null, isLoading: true };
    const preferred = user?.assignedStore;
    if (preferred && stores?.some((s) => s.id === preferred)) {
      return { storeId: preferred, isLoading: false };
    }
    return { storeId: stores?.[0]?.id ?? null, isLoading: false };
  }, [stores, user?.assignedStore, isLoading]);
}