import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Lightweight QueryClient persister backed by AsyncStorage.
 *
 * The mobile app makes 4+ API calls on Home mount. Without persistence every
 * cold start re-fetches everything over the network. With this persister the
 * user sees cached data instantly on the next launch while React Query
 * revalidates in the background.
 *
 * Mirrors the behaviour of @tanstack/query-async-storage-persister without
 * pulling in another dependency.
 */

const STORAGE_KEY = 'store_query_cache_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — keep a day of cached responses

// Query keys we never want to replay from disk. These are queries whose
// empty/old value causes silent UX bugs (e.g. the Stock page showing zero
// ingredients because a previous session captured an empty array before the
// admin had allocated anything). Re-fetching them on every cold start is
// cheap and matches what users expect.
const SKIP_KEYS: ReadonlyArray<string> = [
  'store-needs-today',
  'recipes', // see RecipesScreen — admin may have created recipes since
  'allocations', // admin web mutates these out-of-band; freshness matters
];

function shouldPersistKey(queryKey: unknown[]): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return true;
  const head = String(queryKey[0] ?? '');
  return !SKIP_KEYS.includes(head);
}

interface PersistedClient {
  buster: string;
  timestamp: number;
  entries: Array<{ keyHash: string; queryKey: unknown[]; data: unknown; dataUpdatedAt: number }>;
}

function deserialise(raw: string): PersistedClient | null {
  try {
    return JSON.parse(raw) as PersistedClient;
  } catch {
    return null;
  }
}

export async function loadPersistedClient(buster: string): Promise<PersistedClient | undefined> {
  if (typeof window === 'undefined' && typeof navigator === 'undefined') {
    // Skip persistence in pure Node test environments.
    return undefined;
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = deserialise(raw);
    if (!parsed) return undefined;
    if (parsed.buster !== buster) return undefined;
    if (Date.now() - parsed.timestamp > MAX_AGE_MS) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function savePersistedClient(queryClient: QueryClient, buster: string): Promise<void> {
  try {
    const entries = queryClient
      .getQueryCache()
      .getAll()
      .filter((q) => shouldPersistKey(q.queryKey as unknown[]))
      .map((q) => ({
        keyHash: q.queryHash,
        queryKey: q.queryKey as unknown[],
        data: q.state.data,
        dataUpdatedAt: q.state.dataUpdatedAt,
      }));
    const payload: PersistedClient = {
      buster,
      timestamp: Date.now(),
      entries,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Persistence is a perf optimisation, not a correctness requirement.
  }
}

export async function clearPersistedClient(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Wires up the persister to a QueryClient so its cache is restored on mount
 * and saved on every successful mutation / settle. Bumping `buster` (e.g. on
 * logout) invalidates the persisted snapshot.
 */
export function attachQueryPersister(queryClient: QueryClient, buster: string): () => void {
  let pending: ReturnType<typeof setTimeout> | null = null;

  const scheduleSave = (): void => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      void savePersistedClient(queryClient, buster);
    }, 500);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe(() => scheduleSave());

  void loadPersistedClient(buster).then((persisted) => {
    if (!persisted) return;
    for (const entry of persisted.entries) {
      queryClient.setQueryData(entry.queryKey, entry.data, {
        updatedAt: entry.dataUpdatedAt,
      });
    }
  });

  return () => {
    unsubscribe();
    if (pending) clearTimeout(pending);
  };
}