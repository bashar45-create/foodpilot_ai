export interface AuthUser {
  userId: string;
  businessId?: string;
  role?: 'WORKER' | 'MANAGER' | 'OWNER' | 'SUPER_ADMIN';
  assignedStore?: string | null;
  name?: string;
  email?: string;
}

export interface QueueItem {
  id: number;
  type: 'SALE' | 'STOCK_RETURN' | 'TICKET';
  payload: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  createdAt: string;
  lastAttemptAt?: string | null;
  retryCount: number;
  errorMessage?: string | null;
}
