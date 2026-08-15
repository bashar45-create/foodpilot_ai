import { apiClient } from '@/api/client';

export interface FoodAllocationRequest {
  storeId: string;
  foodItemId: string;
  quantity: number;
}

export interface FoodAllocationDeduction {
  ingredientId: string;
  quantity: number;
  before: number;
  after: number;
}

export interface FoodAllocationResult {
  storeId: string;
  foodId: string;
  foodName: string;
  quantity: number;
  transactional: boolean;
  deductions: FoodAllocationDeduction[];
}

export async function allocateFood(input: FoodAllocationRequest): Promise<FoodAllocationResult> {
  return apiClient.post('/api/v1/inventory/allocate-food', input);
}

export interface AdjustmentRequest {
  ingredientId: string;
  /** Signed delta — positive to add stock, negative to remove. */
  quantity: number;
  reason: string;
  storeId?: string | null;
}

export interface AdjustmentResult {
  ingredient: import('./ingredients').Ingredient;
  log: unknown;
}

export async function adjustStock(input: AdjustmentRequest): Promise<AdjustmentResult> {
  return apiClient.post('/api/v1/inventory/adjust', input);
}