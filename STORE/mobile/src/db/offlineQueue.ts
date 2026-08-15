import { Platform } from 'react-native';

import type { QueueItem } from '@/types/models';

// The mobile worker app is configured to be always-online in this deployment,
// so on web we never need SQLite. On native we still keep the queue available
// for future offline support, but the runtime path used by web is a no-op.
const isWeb = Platform.OS === 'web';

// Lazily import expo-sqlite only on native so the web bundle never resolves it.
let nativeDbPromise: Promise<import('expo-sqlite').SQLiteDatabase | null> | null = null;

async function getNativeDb(): Promise<import('expo-sqlite').SQLiteDatabase | null> {
  if (isWeb) {
    return null;
  }
  if (!nativeDbPromise) {
    nativeDbPromise = (async () => {
      const SQLite = await import('expo-sqlite');
      return SQLite.openDatabaseAsync('store_worker.db');
    })();
  }
  return nativeDbPromise;
}

async function execSql(
  sql: string,
  params: Array<string | number | null> = [],
): Promise<void> {
  if (isWeb) {
    return;
  }
  const db = await getNativeDb();
  if (!db) {
    return;
  }
  await db.execAsync(`BEGIN;${sql};COMMIT;`).catch(async () => {
    // Some statements (like CREATE TABLE) can run outside a transaction safely.
    await db.execAsync(sql.replace(/;$/, ''));
  });
}

export async function ensureQueueTable(): Promise<void> {
  if (isWeb) {
    return;
  }
  const db = await getNativeDb();
  if (!db) {
    return;
  }
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      createdAt TEXT NOT NULL,
      lastAttemptAt TEXT,
      retryCount INTEGER NOT NULL DEFAULT 0,
      errorMessage TEXT
    );
  `);
}

export async function enqueueItem(item: Omit<QueueItem, 'id'>): Promise<void> {
  if (isWeb) {
    return;
  }
  const db = await getNativeDb();
  if (!db) {
    return;
  }
  await db.runAsync(
    'INSERT INTO offline_queue (type, payload, status, createdAt, lastAttemptAt, retryCount, errorMessage) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [item.type, item.payload, item.status, item.createdAt, item.lastAttemptAt ?? null, item.retryCount, item.errorMessage ?? null],
  );
}

export async function listQueueItems(): Promise<QueueItem[]> {
  if (isWeb) {
    return [];
  }
  const db = await getNativeDb();
  if (!db) {
    return [];
  }
  const result = await db.getAllAsync<QueueItem>(
    'SELECT * FROM offline_queue ORDER BY createdAt ASC',
  );
  return result;
}