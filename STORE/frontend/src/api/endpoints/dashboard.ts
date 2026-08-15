import { apiClient } from '@/api/client';

export interface DashboardTotals {
  ingredients: number;
  activeStores: number;
  todaySales: number;
  todayRevenue: number;
  lowStockItems: number;
}

export interface DashboardSnapshot {
  totals: DashboardTotals;
  generatedAt: string;
}

export async function getDashboard(storeId?: string): Promise<DashboardSnapshot> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return apiClient.get(`/api/v1/dashboard${qs}`);
}