import { useCallback, useEffect, useState } from 'react';

/**
 * Like `useBoolean`, but persists the value to `localStorage` so the user's
 * preference (e.g. collapsed sections) survives page reloads.
 *
 * Silently falls back to in-memory state if `localStorage` is unavailable
 * (SSR, private browsing, etc.).
 */
export function usePersistedBoolean(
  key: string,
  initial = false,
): [boolean, { set: (value: boolean) => void; toggle: () => void }] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initial;
      return raw === '1' || raw === 'true';
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value ? '1' : '0');
    } catch {
      /* ignore quota / privacy errors */
    }
  }, [key, value]);

  const set = useCallback((next: boolean) => setValue(next), []);
  const toggle = useCallback(() => setValue((current) => !current), []);
  return [value, { set, toggle }];
}
