import type { AuthUser } from '@/types/auth';

const ACCESS_TOKEN_KEY = 'store_access_token';
const REFRESH_TOKEN_KEY = 'store_refresh_token';
const USER_KEY = 'store_user';

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return safeStorage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return safeStorage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}

export function getStoredUser(): AuthUser | null {
  const raw = safeStorage()?.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setStoredTokens(accessToken: string | null, refreshToken: string | null): void {
  const store = safeStorage();
  if (!store) return;
  if (accessToken) store.setItem(ACCESS_TOKEN_KEY, accessToken);
  else store.removeItem(ACCESS_TOKEN_KEY);

  if (refreshToken) store.setItem(REFRESH_TOKEN_KEY, refreshToken);
  else store.removeItem(REFRESH_TOKEN_KEY);
}

export function setStoredUser(user: AuthUser | null): void {
  const store = safeStorage();
  if (!store) return;
  if (user) store.setItem(USER_KEY, JSON.stringify(user));
  else store.removeItem(USER_KEY);
}

export function clearStoredTokens(): void {
  const store = safeStorage();
  if (!store) return;
  store.removeItem(ACCESS_TOKEN_KEY);
  store.removeItem(REFRESH_TOKEN_KEY);
  store.removeItem(USER_KEY);
}