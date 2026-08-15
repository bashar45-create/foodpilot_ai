import { apiClient } from '@/api/client';

export interface ForecastEntry {
  foodItemId: string;
  name: string;
  category?: string;
  averageQuantity: number;
  predictedQuantity: number;
  totalRevenue: number;
  basedOnDays: number;
}

export interface ForecastDayPoint {
  date: string;
  predictedQuantity: number;
}

export interface ForecastItem {
  foodItemId: string;
  name: string;
  category?: string;
  weightedAverage: number;
  daily: ForecastDayPoint[];
  totalPredicted: number;
}

export interface ProjectedForecast {
  days: string[];
  startDate: string;
  endDate: string;
  basisDays: number;
  items: ForecastItem[];
  legacy: ForecastEntry[];
}

export async function getDailyForecast(days = 7): Promise<ForecastEntry[]> {
  return apiClient.get(`/api/v1/forecasts/daily?days=${days}`);
}

export async function getProjectedDailyForecast(
  days = 7,
  top = 10,
  storeId?: string,
): Promise<ProjectedForecast> {
  const params = new URLSearchParams({ days: String(days), top: String(top) });
  if (storeId) params.set('storeId', storeId);
  return apiClient.get(`/api/v1/forecasts/projected-daily?${params.toString()}`);
}