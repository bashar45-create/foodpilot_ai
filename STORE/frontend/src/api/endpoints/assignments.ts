import { apiClient } from '@/api/client';

export interface AssignmentAllocation {
  ingredientId: string;
  quantity: number;
}

export interface DailyAssignment {
  businessId: string;
  storeId: string;
  date: string;
  allocations: AssignmentAllocation[];
  updatedAt?: string;
  createdAt?: string;
  id?: string;
}

export interface UpsertAssignmentRequest {
  storeId: string;
  date: string;
  allocations: AssignmentAllocation[];
}

export async function getAssignment(storeId: string, date: string): Promise<DailyAssignment> {
  return apiClient.get(
    `/api/v1/assignments/daily?storeId=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}`,
  );
}

export async function upsertAssignment(input: UpsertAssignmentRequest): Promise<DailyAssignment> {
  return apiClient.put('/api/v1/assignments/daily', input);
}

export async function listRecentAssignments(storeId: string): Promise<DailyAssignment[]> {
  return apiClient.get(`/api/v1/assignments/recent?storeId=${encodeURIComponent(storeId)}`);
}