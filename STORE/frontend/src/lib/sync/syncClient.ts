import { getAccessToken } from '@/lib/tokenStore';

import type { SyncConnectionState, SyncConnectionStatus, SyncEvent } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

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
    this.openSocket();
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

  private openSocket(): void {
    const token = getAccessToken();
    if (!token) {
      // No session yet; try again shortly rather than opening an unauthenticated socket.
      this.scheduleReconnect();
      return;
    }

    this.setStatus('connecting');
    const wsBase = API_BASE_URL.replace(/^http/, 'ws');
    const socket = new WebSocket(`${wsBase}/api/v1/ws?token=${encodeURIComponent(token)}`);
    this.socket = socket;

    socket.onopen = () => {
      this.setStatus('connected');
    };

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as SyncEvent;
        this.eventListeners.forEach((listener) => listener(event));
      } catch {
        // Ignore malformed frames (e.g. a stray {"type":"pong"} heartbeat reply).
      }
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.manuallyClosed) return;
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed) return;
    const attempts = this.state.reconnectAttempts + 1;
    this.state = { ...this.state, reconnectAttempts: attempts };
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }
}

export const syncClient = new SyncClient();
