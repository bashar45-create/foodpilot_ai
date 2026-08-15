import { apiClient } from '@/api/client';

export interface StoreInventoryRow {
  id?: string;
  storeId: string;
  ingredientId: string;
  ingredientName?: string | null;
  quantity: number;
  minimumStock?: number;
  unit?: string;
}

/**
 * Aggregated ingredient demand for a store based on today's ACTIVE allocations.
 *
 * Returned by ``GET /store-inventory/needs-today`` — preferred over
 * ``getStoreInventory`` for the worker Stock page because it surfaces only
 * the ingredients the worker actually needs to make today's allocated food
 * (with proper names), plus the shelf quantity they already have on hand
 * so they can spot shortfalls at a glance.
 */
export interface StoreNeedsTodayRow {
  ingredientId: string;
  ingredientName?: string | null;
  unit?: string | null;
  category?: string | null;
  required: number;
  storeHas: number;
  shortfall: number;
  poolCurrent: number;
  costPerUnit: number;
}

export async function getStoreInventory(storeId: string): Promise<StoreInventoryRow[]> {
  return apiClient.get(`/api/v1/store-inventory?storeId=${encodeURIComponent(storeId)}`);
}

export async function getStoreLowStock(storeId: string): Promise<StoreInventoryRow[]> {
  return apiClient.get(`/api/v1/store-inventory/low-stock?storeId=${encodeURIComponent(storeId)}`);
}

export async function getStoreNeedsToday(storeId: string): Promise<StoreNeedsTodayRow[]> {
  return apiClient.get(
    `/api/v1/store-inventory/needs-today?storeId=${encodeURIComponent(storeId)}`,
  );
}