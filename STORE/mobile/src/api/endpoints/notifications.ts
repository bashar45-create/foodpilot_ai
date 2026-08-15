import { apiClient } from '@/api/client';

export interface NotificationRecord {
  id: string;
  businessId: string;
  storeId?: string;
  type: 'LOW_STOCK' | 'SYSTEM' | string;
  title: string;
  message: string;
  ingredientId?: string;
  ingredientName?: string;
  quantity?: number;
  minimumStock?: number;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(storeId?: string): Promise<NotificationRecord[]> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return apiClient.get(`/api/v1/notifications${qs}`);
}

export async function markNotificationRead(id: string): Promise<NotificationRecord> {
  return apiClient.post(`/api/v1/notifications/${id}/read`);
}