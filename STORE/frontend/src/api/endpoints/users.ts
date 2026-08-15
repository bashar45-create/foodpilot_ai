import { apiClient } from '@/api/client';

export type UserRole = 'OWNER' | 'MANAGER' | 'WORKER' | 'SUPER_ADMIN';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  businessId?: string;
  assignedStore?: string | null;
  isActive?: boolean;
  lastLogin?: string | null;
  createdAt?: string;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  assignedStore?: string | null;
}

export interface UpdateUserRequest {
  email?: string;
  name?: string;
  role?: UserRole;
  assignedStore?: string | null;
  isActive?: boolean;
}

export interface UpdateUserPayload {
  id: string;
  input: {
    email?: string;
    name?: string;
    role?: UserRole;
    assignedStore?: string | null;
  };
}

export async function listUsers(): Promise<UserRecord[]> {
  return apiClient.get('/api/v1/users');
}

export async function createUser(input: CreateUserRequest): Promise<UserRecord> {
  return apiClient.post('/api/v1/users', input);
}

export async function updateUser(id: string, input: UpdateUserRequest): Promise<UserRecord> {
  return apiClient.put(`/api/v1/users/${id}`, input);
}

export async function deleteUser(id: string): Promise<{ deleted: boolean }> {
  return apiClient.delete(`/api/v1/users/${id}`);
}

export async function toggleUserStatus(id: string, isActive: boolean): Promise<UserRecord> {
  return apiClient.patch(`/api/v1/users/${id}/status`, { isActive });
}

export async function assignUserToStore(id: string, storeId: string | null): Promise<UserRecord> {
  return apiClient.patch(`/api/v1/users/${id}/assign-store`, { storeId });
}

export async function resetUserPassword(id: string, newPassword: string): Promise<{ temporary: string }> {
  return apiClient.patch(`/api/v1/users/${id}/reset-password`, { password: newPassword });
}