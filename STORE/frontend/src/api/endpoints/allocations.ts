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
  /** Computed by the store-summary endpoint, not always present. */
  sold?: number;
  remaining?: number;
  revenue?: number;
  /** Set after a successful /reclaim call. */
  reclaimedRemaining?: number;
  reclaimedAt?: string;
  reclaimedBy?: string | null;
  refunds?: Array<{
    ingredientId: string;
    ingredientName?: string | null;
    amount: number;
  }>;
}

export interface AllocationCreateRequest {
  storeId: string;
  foodItemId: string;
  quantity: number;
  date?: string;
  notes?: string;
}

export interface AllocationUpdateRequest {
  quantity?: number;
  notes?: string;
}

export interface AllocationTotals {
  allocated: number;
  activeAllocated: number;
  remaining: number;
  revenue: number;
  cost: number;
  reclaimedAllocated: number;
  reversedAllocated: number;
  sold: number;
}

export interface StoreAllocationSummary {
  storeId: string;
  start?: string;
  end?: string;
  allocations: Allocation[];
  totals: AllocationTotals;
}

function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : '';
}

export async function createAllocation(input: AllocationCreateRequest): Promise<Allocation> {
  return apiClient.post('/api/v1/allocations', input);
}

export async function listAllocations(params: {
  storeId?: string;
  foodId?: string;
  start?: string;
  end?: string;
  status?: string;
  limit?: number;
} = {}): Promise<Allocation[]> {
  return apiClient.get(`/api/v1/allocations${qs(params)}`);
}

export async function getAllocation(id: string): Promise<Allocation> {
  return apiClient.get(`/api/v1/allocations/${id}`);
}

export async function updateAllocation(id: string, input: AllocationUpdateRequest): Promise<Allocation> {
  return apiClient.put(`/api/v1/allocations/${id}`, input);
}

export async function deleteAllocation(id: string): Promise<Allocation> {
  return apiClient.delete(`/api/v1/allocations/${id}`);
}

export async function reclaimAllocation(id: string): Promise<Allocation> {
  return apiClient.post(`/api/v1/allocations/${id}/reclaim`);
}

export async function getStoreAllocationSummary(
  storeId: string,
  range: { start?: string; end?: string } = {},
): Promise<StoreAllocationSummary> {
  return apiClient.get(`/api/v1/allocations/store/${storeId}/summary${qs(range)}`);
}

export interface StaleActiveRow extends Allocation {
  remaining: number;
}

export interface StaleActiveSummary {
  today: string;
  count: number;
  rows: StaleActiveRow[];
}

export async function getStaleActiveAllocations(): Promise<StaleActiveSummary> {
  return apiClient.get('/api/v1/allocations/stale-active');
}