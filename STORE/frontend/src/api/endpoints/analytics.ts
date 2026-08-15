import { apiClient } from '@/api/client';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RevenueBucket {
  key: string;
  revenue: number;
  sales: number;
  quantity: number;
}

export interface RevenueResponse {
  groupBy: 'day' | 'week' | 'month' | 'store' | 'food';
  start: string;
  end: string;
  buckets: RevenueBucket[];
  total: { revenue: number; sales: number; quantity: number };
}

export interface ProfitByStore {
  storeId: string;
  storeName: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  sales: number;
}

export interface ProfitResponse {
  start: string;
  end: string;
  total: { revenue: number; cost: number; profit: number; marginPct: number; sales: number };
  byStore: ProfitByStore[];
}

export interface InventoryRow {
  ingredientId: string;
  name: string;
  category?: string;
  currentStock: number;
  unit?: string;
  costPerUnit: number;
  valuation: number;
}

export interface InventoryResponse {
  start: string;
  end: string;
  summary: {
    valuation: number;
    turnoverRatio: number;
    wastePct: number;
    ingredientCount: number;
  };
  byIngredient: InventoryRow[];
}

export interface EmployeeRanking {
  userId: string;
  name: string;
  email?: string;
  role?: string;
  assignedStore?: string;
  sales: number;
  revenue: number;
  quantity: number;
}

export interface EmployeesResponse {
  start: string;
  end: string;
  ranking: EmployeeRanking[];
  note?: string;
}

export interface StoreComparison {
  storeId: string;
  name: string;
  type?: string;
  status?: string;
  isActive?: boolean;
  sales: number;
  revenue: number;
  quantity: number;
  lowStockItems: number;
  topFood: { foodItemId: string; name?: string; quantity: number }[];
}

export interface StoresComparisonResponse {
  start: string;
  end: string;
  stores: StoreComparison[];
}

export interface FoodPerformance {
  foodItemId: string;
  name: string;
  category?: string;
  quantity: number;
  revenue: number;
  sales: number;
}

export interface FoodResponse {
  start: string;
  end: string;
  topSellers: FoodPerformance[];
  lowPerformers: FoodPerformance[];
}

export interface StoreSummaryAllocation {
  id: string;
  foodId: string;
  foodName?: string;
  date: string;
  allocated: number;
  sold: number;
  remaining: number;
  unitPrice: number;
  revenue: number;
  profit: number;
  totalCost: number;
  status?: string;
}

export interface StoreSummaryEmployee {
  id: string;
  username?: string;
  name?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  lastLoginAt?: string | null;
}

export interface StoreSummaryTopFood {
  foodId: string;
  name?: string;
  quantity: number;
  revenue: number;
}

export interface StoreSummaryTotals {
  allocatedCount: number;
  activeEmployeesCount: number;
  lowStockItems: number;
}

export interface StoreSummaryResponse {
  store: Record<string, unknown>;
  today: { sales: number; revenue: number; orders: number };
  last7: { sales: number; revenue: number; orders: number };
  last30: { sales: number; revenue: number; orders: number };
  profit30d: { revenue: number; cost: number; profit: number; marginPct: number; sales: number };
  allocations: StoreSummaryAllocation[];
  employees: StoreSummaryEmployee[];
  topFood: StoreSummaryTopFood[];
  totals: StoreSummaryTotals;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Date range used by analytics endpoints. The backend expects query params
 * ``from`` and ``to`` as ISO date strings. ``storeId`` filters by store.
 */
export interface DateRange {
  from?: string;
  to?: string;
  storeId?: string;
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

// -----------------------------------------------------------------------------
// API calls
// -----------------------------------------------------------------------------

export interface DashboardTotals {
  ingredients: number;
  activeStores: number;
  todaySales: number;
  todayRevenue: number;
  lowStockItems: number;
}

export interface DashboardResponse {
  totals: DashboardTotals;
  generatedAt: string;
}

export interface LowStockItem {
  ingredientId: string;
  ingredientName?: string;
  unit?: string;
  category?: string;
  currentStock: number;
  minimumStock: number;
  costPerUnit: number;
  lineValue: number;
  source: 'pool' | 'shelf';
  storeId?: string | null;
}

export interface LowStockResponse {
  items: LowStockItem[];
  count: number;
  totalValue: number;
  storeId?: string | null;
  sources: { pool: number; shelf: number };
}

export async function getDashboard(storeId?: string): Promise<DashboardResponse> {
  return apiClient.get(`/api/v1/analytics/dashboard${qs({ storeId })}`);
}

export async function getLowStock(storeId?: string, limit = 50): Promise<LowStockResponse> {
  return apiClient.get(`/api/v1/analytics/low-stock${qs({ storeId, limit })}`);
}

export async function getRevenue(
  range: DateRange = {},
  groupBy: 'day' | 'week' | 'month' | 'store' | 'food' = 'day',
): Promise<RevenueResponse> {
  return apiClient.get(`/api/v1/analytics/revenue${qs({ ...range, groupBy })}`);
}

export async function getProfit(range: DateRange = {}): Promise<ProfitResponse> {
  return apiClient.get(`/api/v1/analytics/profit${qs({ ...range })}`);
}

export async function getInventoryAnalytics(range: DateRange = {}): Promise<InventoryResponse> {
  return apiClient.get(`/api/v1/analytics/inventory${qs({ ...range })}`);
}

export async function getEmployeesAnalytics(range: DateRange = {}, limit = 25): Promise<EmployeesResponse> {
  return apiClient.get(`/api/v1/analytics/employees${qs({ ...range, limit })}`);
}

export async function getStoresComparison(range: DateRange = {}): Promise<StoresComparisonResponse> {
  return apiClient.get(`/api/v1/analytics/stores${qs({ ...range })}`);
}

export async function getFoodAnalytics(range: DateRange = {}, top = 10): Promise<FoodResponse> {
  return apiClient.get(`/api/v1/analytics/food${qs({ ...range, top })}`);
}

export async function getStoreSummary(storeId: string): Promise<StoreSummaryResponse> {
  return apiClient.get(`/api/v1/analytics/store-summary${qs({ storeId })}`);
}

/**
 * Download a CSV for a named report. Returns a Blob URL the caller can wrap
 * in an `<a download>` click.
 */
export async function downloadReportCsv(
  report: 'revenue' | 'profit' | 'inventory' | 'employees' | 'stores' | 'food',
  range: DateRange = {},
  groupBy: 'day' | 'week' | 'month' | 'store' | 'food' = 'day',
): Promise<{ blob: Blob; filename: string }> {
  // We bypass the standard interceptor pipeline here because the CSV endpoint
  // streams a raw text/csv payload (not the {success,data} envelope) and we
  // need access to the response headers for the filename.
  const rawClient = apiClient;
  const response = await rawClient.get<
    Blob | ArrayBuffer | string,
    { data: Blob; headers: Record<string, string> }
  >(
    `/api/v1/analytics/export${qs({ type: 'csv', report, ...range, groupBy })}`,
    { responseType: 'blob' },
  );
  let blob: Blob;
  const payload = response.data;
  if (typeof Blob !== 'undefined' && payload instanceof Blob) {
    blob = payload;
  } else if (typeof ArrayBuffer !== 'undefined' && payload instanceof ArrayBuffer) {
    blob = new Blob([payload], { type: 'text/csv;charset=utf-8' });
  } else if (typeof payload === 'string') {
    blob = new Blob([payload], { type: 'text/csv;charset=utf-8' });
  } else {
    blob = new Blob([String(payload ?? '')], { type: 'text/csv;charset=utf-8' });
  }

  const headers = (response.headers ?? {}) as Record<string, string>;
  const cd: string =
    headers['content-disposition'] ??
    headers['Content-Disposition'] ??
    headers['CONTENT-DISPOSITION'] ??
    '';
  const match = cd.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1]?.trim() ?? `${report}-${new Date().toISOString().slice(0, 10)}.csv`;
  return { blob, filename };
}