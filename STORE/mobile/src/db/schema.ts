export const offlineQueueSchema = `
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
`;
