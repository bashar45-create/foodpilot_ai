import { apiClient } from '@/api/client';

export interface AllocationDeduction {
  ingredientId: string;
  ingredientName?: string | null;
  perUnit: number;
  required: number;
  before: number;
  after: number;
}

export interface Allocation {
  id: string;
  businessId?: string;
  storeId: string;
  foodItemId: string;
  foodName?: string | null;
  recipeId?: string | null;
  quantity: number;
  unitPrice?: number;
  totalCost?: number;
  status: 'ACTIVE' | 'REVERSED' | 'RECLAIMED' | 'PARTIALLY_REVERSED' | string;
  date: string;
  createdBy?: string | null;
  notes?: string | null;
  deductions?: AllocationDeduction[];
  createdAt?: string;
  updatedAt?: string;
  sold?: number;
  remaining?: number;
  revenue?: number;
}

export async function listAllocations(params: {
  storeId?: string;
  start?: string;
  end?: string;
  status?: string;
  limit?: number;
} = {}): Promise<Allocation[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const q = qs.toString();
  return apiClient.get(`/api/v1/allocations${q ? `?${q}` : ''}`);
}

export interface AllocationTotals {
  allocated: number;
  activeAllocated: number;
  reclaimedAllocated: number;
  reversedAllocated: number;
  remaining: number;
  revenue: number;
  cost: number;
  sold: number;
}

export interface StoreAllocationSummary {
  storeId: string;
  start?: string;
  end?: string;
  allocations: Allocation[];
  totals: AllocationTotals;
}

export async function getStoreAllocationSummary(
  storeId: string,
  range: { start?: string; end?: string } = {},
): Promise<StoreAllocationSummary> {
  const qs = new URLSearchParams();
  if (range.start) qs.set('start', range.start);
  if (range.end) qs.set('end', range.end);
  const q = qs.toString();
  return apiClient.get(`/api/v1/allocations/store/${storeId}/summary${q ? `?${q}` : ''}`);
}