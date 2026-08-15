import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useStoreLowStock } from '@/features/store-inventory/hooks/use-store-inventory';
import type { StoreInventoryRow } from '@/api/endpoints/storeInventory';

/**
 * Subscribes to the active store's low-stock list. Whenever a new
 * ingredient id appears between polls, shows a sonner warning toast.
 * Mount once in the authenticated shell.
 */
export function useLowStockToasts(storeId: string | null | undefined) {
  const { data } = useStoreLowStock(storeId ?? undefined);
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!data) return;
    if (!initialized.current) {
      for (const row of data) seen.current.add(row.ingredientId);
      initialized.current = true;
      return;
    }
    const fresh = data.filter((row: StoreInventoryRow) => !seen.current.has(row.ingredientId));
    if (fresh.length > 0) {
      toast.warning(
        `${fresh.length} ingredient${fresh.length === 1 ? '' : 's'} below minimum stock`,
        {
          description: fresh
            .slice(0, 3)
            .map((r) => `${r.ingredient?.name ?? r.ingredientId}: ${r.quantity} (min ${r.minimumStock ?? '—'})`)
            .join('\n'),
        },
      );
      for (const row of fresh) seen.current.add(row.ingredientId);
    }
  }, [data]);
}