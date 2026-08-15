import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'store_access_token';
const REFRESH_TOKEN_KEY = 'store_refresh_token';
const USER_KEY = 'store_user';

const isWeb = Platform.OS === 'web';

// expo-secure-store v14 is synchronous on native and unavailable on the web.
// On web we fall back to window.localStorage so the app boots in Expo Web too.
// The native module is dynamically imported only when actually needed on
// device, keeping it out of the web bundle entirely.
function webGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function webSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // ignore quota / disabled storage
  }
}

function webDelete(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}

type SecureStoreModule = typeof import('expo-secure-store');
let nativeSecureStorePromise: Promise<SecureStoreModule> | null = null;

function getNativeSecureStore(): Promise<SecureStoreModule> {
  if (!nativeSecureStorePromise) {
    nativeSecureStorePromise = import('expo-secure-store');
  }
  return nativeSecureStorePromise;
}

export async function getAccessToken(): Promise<string | null> {
  if (isWeb) return webGet(ACCESS_TOKEN_KEY);
  const SecureStore = await getNativeSecureStore();
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  if (isWeb) return webGet(REFRESH_TOKEN_KEY);
  const SecureStore = await getNativeSecureStore();
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  if (isWeb) {
    webSet(ACCESS_TOKEN_KEY, accessToken);
    webSet(REFRESH_TOKEN_KEY, refreshToken);
    return;
  }
  const SecureStore = await getNativeSecureStore();
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function setStoredUser(userJson: string): Promise<void> {
  if (isWeb) {
    webSet(USER_KEY, userJson);
    return;
  }
  const SecureStore = await getNativeSecureStore();
  await SecureStore.setItemAsync(USER_KEY, userJson);
}

export async function getStoredUser(): Promise<string | null> {
  if (isWeb) return webGet(USER_KEY);
  const SecureStore = await getNativeSecureStore();
  return SecureStore.getItemAsync(USER_KEY);
}

export async function clearTokens(): Promise<void> {
  if (isWeb) {
    webDelete(ACCESS_TOKEN_KEY);
    webDelete(REFRESH_TOKEN_KEY);
    webDelete(USER_KEY);
    return;
  }
  const SecureStore = await getNativeSecureStore();
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
