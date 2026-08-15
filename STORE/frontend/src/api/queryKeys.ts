export const authKeys = {
  me: ['auth', 'me'] as const,
};

export const dashboardKeys = {
  overview: (storeId?: string) => ['dashboard', 'overview', storeId ?? null] as const,
};

export const storeKeys = {
  list: (filters: Record<string, string | number | boolean | null | undefined> = {}) =>
    ['stores', 'list', filters] as const,
  detail: (id: string) => ['stores', 'detail', id] as const,
};

export const inventoryKeys = {
  list: (filters: Record<string, string | number | boolean | null | undefined> = {}) =>
    ['inventory', 'ingredients', filters] as const,
  detail: (id: string) => ['inventory', 'ingredient', id] as const,
  lowStock: () => ['inventory', 'low-stock'] as const,
};

export const recipeKeys = {
  list: (filters: Record<string, string | number | boolean | null | undefined> = {}) =>
    ['recipes', 'list', filters] as const,
  detail: (id: string) => ['recipes', 'detail', id] as const,
  cost: (id: string) => ['recipes', 'cost', id] as const,
};

export const foodKeys = {
  list: (filters: Record<string, string | number | boolean | null | undefined> = {}) =>
    ['food', 'list', filters] as const,
  detail: (id: string) => ['food', 'detail', id] as const,
};

export const userKeys = {
  list: () => ['users', 'list'] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
};

export const storeInventoryKeys = {
  list: (storeId: string) => ['store-inventory', 'list', storeId] as const,
  lowStock: (storeId: string) => ['store-inventory', 'low-stock', storeId] as const,
};

export const assignmentKeys = {
  daily: (storeId: string, date: string) => ['assignments', 'daily', storeId, date] as const,
  recent: (storeId: string) => ['assignments', 'recent', storeId] as const,
};

export const saleKeys = {
  list: (storeId?: string) => ['sales', 'list', storeId ?? null] as const,
  detail: (id: string) => ['sales', 'detail', id] as const,
};

export const forecastKeys = {
  daily: (days: number) => ['forecasts', 'daily', days] as const,
  projected: (days: number, top: number, storeId?: string) =>
    ['forecasts', 'projected-daily', days, top, storeId ?? null] as const,
};

export const analyticsKeys = {
  dashboard: (storeId?: string) => ['analytics', 'dashboard', storeId ?? null] as const,
  revenue: (range: Record<string, string | undefined>, groupBy: string) =>
    ['analytics', 'revenue', range, groupBy] as const,
  profit: (range: Record<string, string | undefined>) => ['analytics', 'profit', range] as const,
  inventory: (range: Record<string, string | undefined>) => ['analytics', 'inventory', range] as const,
  employees: (range: Record<string, string | undefined>) => ['analytics', 'employees', range] as const,
  stores: (range: Record<string, string | undefined>) => ['analytics', 'stores', range] as const,
  food: (range: Record<string, string | undefined>) => ['analytics', 'food', range] as const,
  storeSummary: (storeId: string) => ['analytics', 'store-summary', storeId] as const,
};

export const allocationKeys = {
  all: ['allocations'] as const,
  list: (params: Record<string, string | number | undefined>) => ['allocations', 'list', params] as const,
  detail: (id: string) => ['allocations', 'detail', id] as const,
  storeSummary: (storeId: string, start?: string, end?: string) =>
    ['allocations', 'store-summary', storeId, start ?? null, end ?? null] as const,
};

export const notificationKeys = {
  list: (storeId?: string) => ['notifications', 'list', storeId ?? null] as const,
};

export const attendanceKeys = {
  today: ['attendance', 'today'] as const,
  employee: (userId: string, start: string, end: string) =>
    ['attendance', 'employee', userId, start, end] as const,
  overview: (start: string, end: string) => ['attendance', 'overview', start, end] as const,
};

// Ticket persistence is still a backend placeholder (see specs/001-realtime-data-sync/tasks.md T029) —
// this factory exists so sync wiring has a stable target once real ticket CRUD ships.
export const ticketKeys = {
  list: () => ['tickets', 'list'] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
};
