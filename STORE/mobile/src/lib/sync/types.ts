export type SyncEntity =
  | 'inventory'
  | 'storeInventory'
  | 'sale'
  | 'recipe'
  | 'attendance'
  | 'ticket'
  | 'store'
  | 'allocation'
  | 'assignment'
  | 'food'
  | 'user';

export type SyncAction = 'created' | 'updated' | 'deleted';

export interface SyncEvent {
  eventId: string;
  entity: SyncEntity;
  action: SyncAction;
  businessId: string;
  storeId: string | null;
  recordId: string;
  payload: Record<string, unknown> | null;
  actorUserId: string;
  occurredAt: string;
}

export type SyncConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'polling-fallback';

export interface SyncConnectionState {
  status: SyncConnectionStatus;
  lastConnectedAt: number | null;
  reconnectAttempts: number;
}
