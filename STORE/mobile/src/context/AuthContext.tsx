import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { apiClient } from '@/api/client';
import { clearTokens, getStoredUser, setStoredUser, setTokens } from '@/lib/tokenStore';
import { queryClient } from '@/lib/queryClient';
import { clearPersistedClient } from '@/db/cachePersister';
import type { AuthUser } from '@/types/models';

type ThemeMode = 'light' | 'dark';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isReady: boolean;
  theme: ThemeMode;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/tokenStore';

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [theme] = useState<ThemeMode>('light');

  const hydrate = async (): Promise<void> => {
    const storedUser = await getStoredUser();
    if (storedUser) {
      setUser(JSON.parse(storedUser) as AuthUser);
    }
    setIsReady(true);
  };

  const login = async (email: string, password: string): Promise<void> => {
    // Backend LoginRequest expects `username` (which it lowercases and matches against
    // either the hardcoded admin username or any user's email).
    const response = await apiClient.post('/api/v1/auth/login', { username: email, password }) as { accessToken: string; refreshToken: string; user?: AuthUser };
    await setTokens(response.accessToken, response.refreshToken);
    if (response.user) {
      await setStoredUser(JSON.stringify(response.user));
      setUser(response.user);
    }
  };

  const logout = async (): Promise<void> => {
    await clearTokens();
    queryClient.clear();
    await clearPersistedClient();
    setUser(null);
  };

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isReady,
      theme,
      hydrate,
      login,
      logout,
    }),
    [user, isReady, theme],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
