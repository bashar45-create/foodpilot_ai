import { apiClient } from '@/api/client';

export interface StoreInventoryRow {
  id: string;
  businessId?: string;
  storeId: string;
  ingredientId: string;
  quantity: number;
  minimumStock?: number;
  allocated?: number;
  ingredient?: {
    name: string;
    unit: string;
    costPerUnit?: number;
    category?: string;
  };
}

export interface SetStockRequest {
  storeId: string;
  ingredientId: string;
  quantity: number;
  minimumStock?: number;
}

export async function listStoreInventory(storeId: string): Promise<StoreInventoryRow[]> {
  return apiClient.get(`/api/v1/store-inventory?storeId=${encodeURIComponent(storeId)}`);
}

export async function setStock(input: SetStockRequest): Promise<StoreInventoryRow> {
  return apiClient.put('/api/v1/store-inventory', input);
}

export async function listLowStock(storeId: string): Promise<StoreInventoryRow[]> {
  return apiClient.get(`/api/v1/store-inventory/low-stock?storeId=${encodeURIComponent(storeId)}`);
}