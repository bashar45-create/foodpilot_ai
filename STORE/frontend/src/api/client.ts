import axios, { type AxiosError, type AxiosInstance } from 'axios';

import { ApiException, type ApiError, type ApiSuccess } from '@/types/api';
import {
  clearStoredTokens,
  getAccessToken,
  getRefreshToken,
  setStoredTokens,
} from '@/lib/tokenStore';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

let accessToken: string | null = getAccessToken();
let refreshToken: string | null = getRefreshToken();
let isRefreshing = false;
let queuedRequests: Array<(token: string | null) => void> = [];

function flushQueue(token: string | null): void {
  queuedRequests.forEach((resolve) => resolve(token));
  queuedRequests = [];
}

export function setTokens(nextAccessToken: string | null, nextRefreshToken: string | null): void {
  accessToken = nextAccessToken;
  refreshToken = nextRefreshToken;
  setStoredTokens(nextAccessToken, nextRefreshToken);
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  clearStoredTokens();
}

async function refreshSession(instance: AxiosInstance): Promise<string | null> {
  if (!refreshToken) {
    return null;
  }

  if (isRefreshing) {
    return new Promise((resolve) => {
      queuedRequests.push(resolve);
    });
  }

  isRefreshing = true;
  try {
    const response = await instance.post<{ accessToken: string; refreshToken: string }>('/api/v1/auth/refresh-token', {
      refreshToken,
    });
    accessToken = response.data.accessToken;
    refreshToken = response.data.refreshToken;
    flushQueue(accessToken);
    return accessToken;
  } catch {
    clearTokens();
    flushQueue(null);
    return null;
  } finally {
    isRefreshing = false;
  }
}

function normalizeError(error: unknown): ApiException {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiError>;
    const payload = axiosError.response?.data;
    if (payload?.success === false) {
      return new ApiException(payload.error.message, payload.error.code, {
        details: payload.error.details,
        status: axiosError.response?.status,
      });
    }
    return new ApiException(axiosError.message, 'NETWORK_ERROR', { status: axiosError.response?.status });
  }

  return new ApiException('Unexpected error', 'UNKNOWN_ERROR');
}

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiSuccess<unknown> | unknown;
    if (typeof payload === 'object' && payload !== null && 'success' in payload) {
      if ((payload as ApiSuccess<unknown>).success) {
        return (payload as ApiSuccess<unknown>).data;
      }
      const errorPayload = payload as ApiError;
      throw new ApiException(errorPayload.error.message, errorPayload.error.code, { details: errorPayload.error.details });
    }
    return response.data;
  },
  async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const renewedToken = await refreshSession(apiClient);
      if (renewedToken && error.config) {
        error.config.headers = error.config.headers ?? {};
        error.config.headers.Authorization = `Bearer ${renewedToken}`;
        return apiClient.request(error.config);
      }
    }
    throw normalizeError(error);
  },
);
