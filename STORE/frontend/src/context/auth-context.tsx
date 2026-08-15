import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { clearTokens, setTokens } from '@/api/client';
import * as authApi from '@/api/endpoints/auth';
import {
  getAccessToken,
  getStoredUser,
  setStoredUser,
} from '@/lib/tokenStore';
import type { AuthUser } from '@/types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (input: authApi.RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (accessToken: string, refreshToken: string, user?: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken());
  const [isLoading, setIsLoading] = useState(false);

  // If we have a stored access token but no cached user, ask the backend for the profile
  // so route guards (and RoleGuard) have something to work with after a page refresh.
  useEffect(() => {
    if (accessToken && !user) {
      authApi
        .me()
        .then((profile) => {
          setUser(profile ?? null);
          setStoredUser(profile ?? null);
        })
        .catch(() => {
          // Token is bad or expired; let the api interceptor try a refresh, or surface a login.
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSession = (nextAccessToken: string, nextRefreshToken: string, nextUser: AuthUser | null = null): void => {
    setTokens(nextAccessToken, nextRefreshToken);
    setStoredUser(nextUser);
    setAccessToken(nextAccessToken);
    setUser(nextUser);
  };

  const login = async (username: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await authApi.login({ username, password });
      setSession(response.accessToken, response.refreshToken, response.user ?? null);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (input: authApi.RegisterRequest): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await authApi.register(input);
      setSession(response.accessToken, response.refreshToken, response.user ?? null);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } finally {
      clearTokens();
      setStoredUser(null);
      setUser(null);
      setAccessToken(null);
      setIsLoading(false);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, accessToken, isLoading, login, register, logout, setSession }),
    [user, accessToken, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
