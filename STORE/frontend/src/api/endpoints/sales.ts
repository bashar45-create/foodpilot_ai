import { apiClient } from '@/api/client';

export interface SaleDeduction {
  ingredientId: string;
  name: string;
  required: number;
  unit?: string;
}

export interface LowStockEntry {
  ingredientId: string;
  name: string;
  quantity: number;
  minimumStock: number;
}

export interface Sale {
  id: string;
  businessId: string;
  storeId: string;
  foodItemId: string;
  foodName: string;
  quantity: number;
  channel: 'POS' | 'ONLINE' | 'KIOSK' | string;
  servedBy?: string | null;
  unitPrice: number;
  totalPrice: number;
  costPerUnit: number;
  totalCost: number;
  profit: number;
  deductions?: SaleDeduction[];
  lowStock?: LowStockEntry[];
  createdAt: string;
}

export interface CreateSaleRequest {
  storeId: string;
  foodItemId: string;
  quantity: number;
  channel?: 'POS' | 'ONLINE' | 'KIOSK';
}

export async function listSales(storeId?: string): Promise<Sale[]> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return apiClient.get(`/api/v1/sales${qs}`);
}

export async function getSale(id: string): Promise<Sale> {
  return apiClient.get(`/api/v1/sales/${id}`);
}

export async function recordSale(input: CreateSaleRequest): Promise<Sale> {
  return apiClient.post('/api/v1/sales', input);
}