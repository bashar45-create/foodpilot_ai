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

export async function listFood(): Promise<FoodItem[]> {
  return apiClient.get('/api/v1/food');
}

export async function getFood(id: string): Promise<FoodItem> {
  return apiClient.get(`/api/v1/food/${id}`);
}