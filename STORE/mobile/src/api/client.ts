import axios, { type AxiosError } from 'axios';
import { Platform } from 'react-native';

import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/tokenStore';
import { ApiException, type ApiError, type ApiSuccess } from '@/types/api';

function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (Platform.OS === 'web') {
    return 'http://localhost:8000';
  }
  if (configured) {
    return configured;
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

const baseURL = resolveBaseUrl();

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function refreshSession(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await axios.post<ApiSuccess<{ accessToken: string; refreshToken: string }>>(
      `${baseURL}/api/v1/auth/refresh-token`,
      { refreshToken },
    );
    const { accessToken, refreshToken: nextRefreshToken } = response.data.data;
    await setTokens(accessToken, nextRefreshToken);
    return accessToken;
  } catch {
    await clearTokens();
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiSuccess<unknown> | unknown;
    if (typeof payload === 'object' && payload !== null && 'success' in payload) {
      if ((payload as ApiSuccess<unknown>).success) {
        return (payload as ApiSuccess<unknown>).data;
      }
      const errorPayload = payload as ApiError;
      throw new ApiException(errorPayload.error.message, errorPayload.error.code, errorPayload.error.details);
    }
    return response.data;
  },
  async (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401) {
      const renewedToken = await refreshSession();
      if (renewedToken && error.config) {
        error.config.headers = error.config.headers ?? {};
        error.config.headers.Authorization = `Bearer ${renewedToken}`;
        return apiClient.request(error.config);
      }
    }

    if (error.response?.data?.success === false) {
      throw new ApiException(error.response.data.error.message, error.response.data.error.code, error.response.data.error.details);
    }

    // Surface the actual reason instead of a generic "Network error" so the
    // login screen can tell the user what's wrong (wrong IP, firewall, DNS, etc.).
    const diagnostic = describeNetworkError(error);
    // eslint-disable-next-line no-console
    console.warn('[api] request failed', { url: error.config?.url, baseURL, diagnostic });
    throw new ApiException(diagnostic.message, 'NETWORK_ERROR', diagnostic);
  },
);

interface NetworkDiagnostic {
  url?: string;
  reason: 'no-response' | 'timeout' | 'cancelled' | 'unknown';
  axiosCode?: string;
  message: string;
  [key: string]: unknown;
}

function describeNetworkError(error: AxiosError<unknown>): NetworkDiagnostic {
  const url = error.config?.url;
  const base = error.config?.baseURL ?? baseURL;
  const fullUrl = url ? `${base}${url}` : base;

  if (error.code === 'ECONNABORTED') {
    return {
      url: fullUrl,
      reason: 'timeout',
      axiosCode: error.code,
      message: `Request timed out after 10s talking to ${fullUrl}. The backend is unreachable from this device.`,
    };
  }
  if (error.code === 'ERR_CANCELED') {
    return {
      url: fullUrl,
      reason: 'cancelled',
      axiosCode: error.code,
      message: 'Request was cancelled.',
    };
  }
  // No response (TCP refused, DNS, no route to host). Tell the user *why*
  // and what to check — that's the whole point of this diagnostic.
  return {
    url: fullUrl,
    reason: 'no-response',
    axiosCode: error.code,
    message:
      `Could not reach the backend at ${fullUrl}.\n` +
      `Check: (1) uvicorn was started with --host 0.0.0.0, ` +
      `(2) Windows Firewall allows inbound port 8000, ` +
      `(3) your phone is on the same Wi-Fi as the PC, ` +
      `(4) EXPO_PUBLIC_API_BASE_URL in mobile/.env is correct.`,
  };
}
