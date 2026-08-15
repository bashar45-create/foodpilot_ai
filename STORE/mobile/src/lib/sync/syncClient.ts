import { Platform } from 'react-native';

import { getAccessToken } from '@/lib/tokenStore';

import type { SyncConnectionState, SyncConnectionStatus, SyncEvent } from './types';

function resolveWsBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (Platform.OS === 'web') {
    return 'ws://localhost:8000';
  }
  if (configured) {
    return configured.replace(/^http/, 'ws');
  }
  return Platform.OS === 'android' ? 'ws://10.0.2.2:8000' : 'ws://localhost:8000';
}

type Listener = (event: SyncEvent) => void;
type StatusListener = (state: SyncConnectionState) => void;

const MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 500;

class SyncClient {
  private socket: WebSocket | null = null;
  private eventListeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private state: SyncConnectionState = { status: 'connecting', lastConnectedAt: null, reconnectAttempts: 0 };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;

  connect(): void {
    this.manuallyClosed = false;
    void this.openSocket();
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close(1000);
    this.socket = null;
  }

  onEvent(listener: Listener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.state);
    return () => this.statusListeners.delete(listener);
  }

  getState(): SyncConnectionState {
    return this.state;
  }

  private setStatus(status: SyncConnectionStatus): void {
    this.state = {
      status,
      lastConnectedAt: status === 'connected' ? Date.now() : this.state.lastConnectedAt,
      reconnectAttempts: status === 'connected' ? 0 : this.state.reconnectAttempts,
    };
    this.statusListeners.forEach((listener) => listener(this.state));
  }

  private async openSocket(): Promise<void> {
    const token = await getAccessToken();
    if (!token) {
      this.scheduleReconnect();
      return;
    }

    this.setStatus('connecting');
    const socket = new WebSocket(`${resolveWsBaseUrl()}/api/v1/ws?token=${encodeURIComponent(token)}`);
    this.socket = socket;

    socket.onopen = () => {
      this.setStatus('connected');
    };

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data as string) as SyncEvent;
        this.eventListeners.forEach((listener) => listener(event));
      } catch {
        // Ignore malformed frames.
      }
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.manuallyClosed) return;
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };

    socket.onerror = (event) => {
      // Surface the connection failure for easier diagnostics on real devices.
      // The banner UI shows a generic "network error" — the console message
      // is what tells you whether it's a wrong IP, missing cleartextTraffic,
      // server down, or an expired token.
      // eslint-disable-next-line no-console
      console.warn('[sync] WebSocket error', {
        url: socket.url,
        readyState: socket.readyState,
        event,
      });
      socket.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed) return;
    const attempts = this.state.reconnectAttempts + 1;
    this.state = { ...this.state, reconnectAttempts: attempts };
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => void this.openSocket(), delay);
  }
}

export const syncClient = new SyncClient();
