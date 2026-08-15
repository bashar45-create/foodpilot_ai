# Contract: WebSocket Sync Protocol

## Endpoint

```
GET /api/v1/ws?token={accessToken}
```

Upgraded to a WebSocket connection. `token` is the same JWT access token used as a Bearer token on REST calls (see `backend/app/core/security.py::decode_access_token`).

## Handshake

1. Client opens `wss://{host}/api/v1/ws?token={accessToken}`.
2. Server decodes `token`. On failure (missing, expired, invalid signature): server closes the connection immediately with WS close code `4401` and logs the attempt server-side (per FR-002's clarified silent-reject-and-log behavior — no error frame is sent to the client, matching the "silent from the client's perspective" clarification).
3. On success: server derives `{userId, businessId, role, assignedStore}` from the token (same fields as REST's `CurrentUser`), creates a `ClientSubscription` (see `data-model.md`), subscribes to the Redis channel `sync:business:{businessId}`, and the connection is considered live.
4. No explicit "subscribe to entity X" message is required from the client for v1 — a connection receives all events for its authorized business/store scope, and the client-side event handler (Decision 4 in `research.md`) decides which query keys to invalidate. This keeps the protocol minimal; entity-level server-side filtering can be added later if bandwidth becomes a concern.

## Server → Client messages

Every message is a JSON-encoded `SyncEvent` (see `data-model.md`):

```json
{
  "eventId": "b2b0f6b0-...",
  "entity": "storeInventory",
  "action": "updated",
  "businessId": "biz_123",
  "storeId": "store_456",
  "recordId": "ingredient_789",
  "payload": { "...": "updated fields or full record" },
  "actorUserId": "user_42",
  "occurredAt": "2026-07-14T10:15:30Z"
}
```

Server-side authorization is re-applied per message, not just at connect time: a connection only receives events where `event.businessId == connection.businessId`, and for store-scoped entities, only events matching `connection.assignedStore` when the connection's role is store-scoped (mirrors existing RBAC rules in `app/dependencies/rbac.py`).

## Client → Server messages

- `{"type": "ping"}` — optional heartbeat the client may send; server responds `{"type": "pong"}`. Used to detect a half-open connection faster than TCP timeout, feeding `SyncConnectionState`.
- No other client-to-server message types in v1 (writes still go through REST, not the socket).

## Close codes

| Code | Meaning |
|---|---|
| `4401` | Authentication failed (missing/invalid/expired token) at handshake. |
| `1000` | Normal closure (client navigated away / logged out). |
| `1006` | Abnormal closure (network drop) — client should treat as `disconnected` and begin reconnect/backoff per `SyncConnectionState`. |

## Reconnection contract (client responsibility)

On any non-`1000` close, or on `ping` timeout, the client sets `SyncConnectionState.status = "disconnected"`, begins exponential-backoff reconnect attempts, and — after the grace period defined in `research.md` Decision 6 — flips affected queries to `refetchInterval: 15000` (polling fallback). On successful reconnect, the client immediately invalidates all currently-mounted queries (catch-up resync per Decision 5) before turning polling back off.
