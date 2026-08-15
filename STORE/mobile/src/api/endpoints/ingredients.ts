import { apiClient } from '@/api/client';

export interface Ingredient {
  id: string;
  businessId: string;
  name: string;
  category?: string | null;
  unit: string;
  costPerUnit: number;
  currentStock: number;
  minimumStock: number;
  status?: 'ACTIVE' | 'INACTIVE' | string;
  description?: string | null;
}

export async function listIngredients(): Promise<Ingredient[]> {
  return apiClient.get('/api/v1/inventory/ingredients');
}

export async function listLowStock(): Promise<Ingredient[]> {
  return apiClient.get('/api/v1/inventory/low-stock');
}