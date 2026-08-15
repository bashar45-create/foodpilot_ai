import { apiClient } from '@/api/client';

export interface FoodItem {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price: number;
  cost: number;
  estimatedProfit: number;
  recipeId?: string | null;
  imageUrl?: string | null;
  assignedStores?: string[];
  status?: 'ACTIVE' | 'INACTIVE' | string;
}

export interface CreateFoodRequest {
  name: string;
  description?: string;
  category?: string;
  price: number;
  recipeId: string;
  imageUrl?: string;
  assignedStores?: string[];
}

export interface UpdateFoodRequest {
  name?: string;
  description?: string;
  category?: string;
  price?: number;
  recipeId?: string;
  imageUrl?: string;
  assignedStores?: string[];
  status?: 'ACTIVE' | 'INACTIVE';
}

export async function listFood(): Promise<FoodItem[]> {
  return apiClient.get('/api/v1/food');
}

export async function getFood(id: string): Promise<FoodItem> {
  return apiClient.get(`/api/v1/food/${id}`);
}

export async function createFood(input: CreateFoodRequest): Promise<FoodItem> {
  return apiClient.post('/api/v1/food', input);
}

export async function updateFood(id: string, input: UpdateFoodRequest): Promise<FoodItem> {
  return apiClient.put(`/api/v1/food/${id}`, input);
}

export async function deleteFood(id: string): Promise<{ deleted: boolean }> {
  return apiClient.delete(`/api/v1/food/${id}`);
}

export async function recalculateFoodCost(id: string): Promise<FoodItem> {
  return apiClient.post(`/api/v1/food/${id}/recalculate-cost`);
}