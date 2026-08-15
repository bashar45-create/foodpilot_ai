# Data Model: Real-Time Cross-App Data Sync

These are new, sync-specific constructs layered on top of existing domain models (`app/models/*.py`). No existing MongoDB document schema changes — this feature adds a propagation layer, it does not alter what's stored.

## SyncEvent (wire message, not persisted)

Represents a single Data Change Event (per `spec.md` Key Entities) published from a service method and delivered to subscribed clients. Not stored in MongoDB — constructed in-memory, published to Redis, delivered over WebSocket, then discarded (per Decision 5: no event backlog/replay in v1).

| Field | Type | Notes |
|---|---|---|
| `eventId` | string (UUID) | Unique per event; useful for client-side dedup if the same event arrives via more than one path. |
| `entity` | string (enum) | Canonical entity name, e.g. `inventory`, `sale`, `recipe`, `attendance`, `ticket`, `store`, `storeInventory`, `allocation`, `assignment`, `user`, `food`. Maps 1:1 to a query-key namespace (see `contracts/entity-query-key-map.md`). |
| `action` | string (enum) | `created` \| `updated` \| `deleted`. |
| `businessId` | string | Tenant scope — required on every event; used for Redis channel routing and client-side authorization filtering. |
| `storeId` | string \| null | Store scope, when the entity is store-scoped (e.g. `storeInventory`, `attendance`). Null for business-wide entities (e.g. `store` settings themselves, `user`). |
| `recordId` | string | ID of the affected document. |
| `payload` | object \| null | Optional inline snapshot of the affected record (or the fields that changed) to support `setQueryData` without a refetch. Omitted (null) for `deleted` actions and for entities where sending the full record is unnecessary. |
| `actorUserId` | string | The user whose action triggered this event — used so a client can optionally suppress a self-notification (the acting user already sees their own change locally; the toast in FR-012 is primarily for *other* viewers). |
| `occurredAt` | string (ISO-8601 timestamp) | Server-side event creation time. |

**Validation rules**:
- `businessId` and `entity` are always required; a `SyncEvent` cannot be constructed without a tenant scope, mirroring the "never omit businessId" rule in `CLAUDE.md`.
- `action = "deleted"` implies `payload = null` (nothing to snapshot).

## ClientSubscription (in-memory, per WebSocket connection)

Represents an active client (per `spec.md` Key Entities) — one browser tab or one mobile app session with an open `/api/v1/ws` connection. Held in server process memory for the lifetime of the connection; not persisted.

| Field | Type | Notes |
|---|---|---|
| `connectionId` | string (UUID) | Generated on accept. |
| `userId` | string | From decoded JWT. |
| `businessId` | string | From decoded JWT — determines which Redis channel(s) this connection subscribes to. |
| `role` | string | From decoded JWT — used to further restrict which entities/records this connection may receive (mirrors REST RBAC). |
| `assignedStore` | string \| null | From decoded JWT — worker roles scoped to a single store only receive store-scoped events for that store. |
| `connectedAt` | timestamp | For observability/debugging. |

**Lifecycle**: created on successful WS handshake auth; destroyed on disconnect (client close, network drop, or server-initiated close for an unauthorized/invalid token per FR-002's clarified silent-reject-and-log behavior).

## SyncConnectionState (client-side, not server-side)

Represents the Sync State entity from `spec.md` — tracked independently on each client (web `SyncConnectionContext`, mobile equivalent) to drive UI and the fallback-polling toggle from Decision 6.

| Field | Type | Notes |
|---|---|---|
| `status` | string (enum) | `connecting` \| `connected` \| `disconnected` \| `polling-fallback`. |
| `lastConnectedAt` | timestamp \| null | Used to decide when to trigger the reconnect catch-up resync (Decision 5). |
| `reconnectAttempts` | number | For backoff logic on reconnection attempts. |

## Entity coverage (full scope per FR-003)

Per the clarified FR-003, every tenant-scoped data type must eventually emit `SyncEvent`s. Enumerated from the existing service layer (`backend/app/services/`), in priority order per `spec.md`:

**Priority (User Story 1 & 2 scope)**:
1. `storeInventory` / `inventory` — `inventory_service.py`, `store_inventory_service.py`, `inventory_log_service.py`
2. `sale` — `sale_service.py`, `sales_service.py`
3. `recipe` — `recipe_service.py`
4. `attendance` — `attendance_service.py`
5. `ticket` — (ticket handling; see `app/api/tickets.py` and its backing service)
6. `store` — `store_service.py` (store/business settings)

**Remaining scope (full FR-003 completion)**:
7. `allocation` — `allocation_service.py`
8. `assignment` — `assignment_service.py`
9. `food` — `food_service.py`
10. `user` — `user_service.py`
11. `forecast` — `forecast_service.py` (read-heavy/derived; may only need sync if forecasts are user-editable — confirm during implementation)
12. `notification` — `notification_service.py` (currently a placeholder stub; sync applies once real notification writes exist)

`ai_service.py` and `mcp_service.py` are conversational/tool-orchestration services, not tenant data-record CRUD — out of scope for `SyncEvent` emission unless they persist a syncable record type directly.
