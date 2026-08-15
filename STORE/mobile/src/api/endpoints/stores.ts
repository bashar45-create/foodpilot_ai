import { apiClient } from '@/api/client';

export interface Store {
  id: string;
  businessId: string;
  name: string;
  code?: string;
  type?: string;
  address?: string;
  city?: string;
  phone?: string;
  openingTime?: string;
  closingTime?: string;
  status?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function listStores(): Promise<Store[]> {
  return apiClient.get('/api/v1/stores');
}

export async function getStore(id: string): Promise<Store> {
  return apiClient.get(`/api/v1/stores/${id}`);
}