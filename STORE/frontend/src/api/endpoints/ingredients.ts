import { apiClient } from '@/api/client';

export type IngredientUnit = 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'pack' | string;

export interface Ingredient {
  id: string;
  name: string;
  category?: string | null;
  unit: IngredientUnit;
  costPerUnit?: number | null;
  currentStock?: number | null;
  minimumStock?: number | null;
  maximumStock?: number | null;
  supplierId?: string | null;
  isActive?: boolean;
}

export interface CreateIngredientRequest {
  name: string;
  category?: string;
  unit: IngredientUnit;
  costPerUnit?: number;
  currentStock?: number;
  minimumStock?: number;
  maximumStock?: number;
  supplierId?: string;
}

export interface UpdateIngredientRequest {
  name?: string;
  category?: string;
  unit?: IngredientUnit;
  costPerUnit?: number;
  currentStock?: number;
  minimumStock?: number;
  maximumStock?: number;
  supplierId?: string;
  isActive?: boolean;
}

export async function listIngredients(params: { category?: string; lowStock?: boolean } = {}): Promise<Ingredient[]> {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (typeof params.lowStock === 'boolean') search.set('lowStock', String(params.lowStock));
  const qs = search.toString();
  return apiClient.get(`/api/v1/inventory/ingredients${qs ? `?${qs}` : ''}`);
}

export async function getIngredient(id: string): Promise<Ingredient> {
  return apiClient.get(`/api/v1/inventory/ingredients/${id}`);
}

export async function createIngredient(input: CreateIngredientRequest): Promise<Ingredient> {
  return apiClient.post('/api/v1/inventory/ingredients', input);
}

export async function updateIngredient(id: string, input: UpdateIngredientRequest): Promise<Ingredient> {
  return apiClient.put(`/api/v1/inventory/ingredients/${id}`, input);
}

export async function deleteIngredient(id: string): Promise<{ deleted: boolean }> {
  return apiClient.delete(`/api/v1/inventory/ingredients/${id}`);
}

export async function listLowStock(): Promise<Ingredient[]> {
  return apiClient.get('/api/v1/inventory/low-stock');
}
