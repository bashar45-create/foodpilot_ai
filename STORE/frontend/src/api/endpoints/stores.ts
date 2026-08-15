import { apiClient } from '@/api/client';

export type StoreType = 'RETAIL' | 'FOOD' | 'WAREHOUSE' | 'KITCHEN';
export type StoreStatus = 'OPEN' | 'CLOSED' | 'INACTIVE';

export interface StoreRecord {
  id: string;
  name: string;
  type: StoreType;
  status: StoreStatus;
  phone?: string | null;
}

export interface CreateStoreRequest {
  name: string;
  type: StoreType;
  phone?: string;
}

export async function listStores(): Promise<StoreRecord[]> {
  return apiClient.get('/api/v1/stores');
}

export async function createStore(input: CreateStoreRequest): Promise<StoreRecord> {
  return apiClient.post('/api/v1/stores', input);
}
