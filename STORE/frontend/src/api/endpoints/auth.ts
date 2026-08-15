import { apiClient } from '@/api/client';
import type { AuthUser } from '@/types/auth';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  businessName: string;
  username: string;
  password: string;
  name: string;
  industry?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export async function login(input: LoginRequest): Promise<AuthTokens & { user?: AuthUser }> {
  return apiClient.post('/api/v1/auth/login', input);
}

export async function register(input: RegisterRequest): Promise<AuthTokens & { user?: AuthUser }> {
  return apiClient.post('/api/v1/auth/register', input);
}

export async function logout(): Promise<void> {
  await apiClient.post('/api/v1/auth/logout');
}

export async function me(): Promise<AuthUser> {
  return apiClient.get('/api/v1/auth/me');
}

export async function refreshToken(refreshToken: string): Promise<AuthTokens> {
  return apiClient.post('/api/v1/auth/refresh-token', { refreshToken });
}

export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post('/api/v1/auth/forgot-password', { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiClient.post('/api/v1/auth/reset-password', { token, password });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/api/v1/auth/change-password', { currentPassword, newPassword });
}
