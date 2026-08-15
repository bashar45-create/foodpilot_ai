import { apiClient } from '@/api/client';

export interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
  unit?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string | null;
  ingredients: RecipeIngredient[];
  status?: 'DRAFT' | 'APPROVED' | 'ARCHIVED' | string;
  yield?: number | null;
  foodItemId?: string | null;
  preparationSteps?: string[];
  servingSize?: number | string | null;
}

export interface CreateRecipeRequest {
  name: string;
  description?: string;
  ingredients: RecipeIngredient[];
  status?: 'DRAFT' | 'APPROVED';
  yield?: number;
  foodItemId?: string | null;
  preparationSteps?: string[];
  servingSize?: number | string;
}

export interface UpdateRecipeRequest {
  name?: string;
  description?: string;
  ingredients?: RecipeIngredient[];
  status?: 'DRAFT' | 'APPROVED' | 'ARCHIVED';
  yield?: number;
  foodItemId?: string | null;
  preparationSteps?: string[];
  servingSize?: number | string;
}

export interface RecipeCostLine {
  ingredientId: string;
  name: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
}

export interface RecipeCost {
  recipeId: string;
  currency: string;
  totalCost: number;
  lines: RecipeCostLine[];
}

export async function listRecipes(): Promise<Recipe[]> {
  return apiClient.get('/api/v1/recipes');
}

export async function getRecipe(id: string): Promise<Recipe> {
  return apiClient.get(`/api/v1/recipes/${id}`);
}

export async function createRecipe(input: CreateRecipeRequest): Promise<Recipe> {
  return apiClient.post('/api/v1/recipes', input);
}

export async function updateRecipe(id: string, input: UpdateRecipeRequest): Promise<Recipe> {
  return apiClient.put(`/api/v1/recipes/${id}`, input);
}

export async function deleteRecipe(id: string): Promise<{ deleted: boolean }> {
  return apiClient.delete(`/api/v1/recipes/${id}`);
}

export async function getRecipeCost(id: string): Promise<RecipeCost> {
  return apiClient.get(`/api/v1/recipes/${id}/cost`);
}