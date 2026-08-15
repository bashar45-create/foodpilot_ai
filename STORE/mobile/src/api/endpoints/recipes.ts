import { apiClient } from '@/api/client';

export interface RecipeIngredient {
  ingredientId: string;
  ingredientName?: string | null;
  quantity: number;
  unit?: string;
}

export interface Recipe {
  id: string;
  businessId?: string;
  name: string;
  description?: string | null;
  foodItemId?: string | null;
  status?: 'DRAFT' | 'APPROVED' | 'ARCHIVED' | string;
  yield?: number | null;
  servingSize?: number | null;
  preparationSteps?: string[];
  ingredients: RecipeIngredient[];
  createdAt?: string;
  updatedAt?: string;
}

export async function listRecipes(): Promise<Recipe[]> {
  return apiClient.get('/api/v1/recipes');
}

export async function getRecipe(id: string): Promise<Recipe> {
  return apiClient.get(`/api/v1/recipes/${id}`);
}