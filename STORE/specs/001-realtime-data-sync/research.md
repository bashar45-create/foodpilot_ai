# Research: Real-Time Cross-App Data Sync

## Context recap

Confirmed by reading the codebase (not assumed):

- **Frontend** (`frontend/src/lib/query-client.ts`) uses TanStack Query with `staleTime: 30_000` and `refetchOnWindowFocus: false` — data is fetched once and only re-fetched on navigation/mutation-driven invalidation or a manual reload. No push channel exists anywhere in the repo (`grep` for websocket/socket.io/SSE across backend, frontend, mobile found no real usage).
- **Mobile** (`mobile/package.json`) already has `@tanstack/react-query` and `@react-native-community/netinfo`, matching the frontend's data-fetching pattern, but no toast/banner component exists yet for FR-012.
- **Backend** (`backend/app/config.py`) already declares `redis_url` (`REDIS_URL` env var) and `redis==5.2.1` is in `backend/requirements.txt`, but `grep` found zero actual Redis usage in `app/` — it's provisioned but unwired.
- **Backend auth** (`backend/app/dependencies/auth.py`) decodes a JWT bearer token into a `CurrentUser{userId, businessId, role, assignedStore, ...}` via `HTTPBearer`. This only works for header-based auth on regular HTTP requests — WebSocket handshakes need a different token-passing mechanism (see Decision 3).
- **Backend services** (`backend/app/services/*.py`) all extend `BaseService` and are the only layer allowed to hold business logic per `CLAUDE.md`'s layering rule (api → services → repositories → database). This is the correct place to hook in change-event publishing — never in `api/` or `repositories/`.
- **Full data-type scope**: per spec FR-003 (post-clarification), literally every tenant-scoped data type must sync, not just a fixed list. The service layer currently has 14 non-trivial services (`inventory_service`, `sale_service`, `sales_service`, `recipe_service`, `attendance_service`, `assignment_service`, `allocation_service`, `store_service`, `store_inventory_service`, `food_service`, `user_service`, `inventory_log_service`, `forecast_service`, `notification_service`) — the mechanism must be generic enough to add to all of them without per-entity bespoke plumbing.

## Decision 1: Transport for server → client push

**Decision**: WebSocket, using FastAPI's native `WebSocket` support (Starlette), one connection per client session at `/api/v1/ws`.

**Rationale**: FastAPI/Starlette has first-class WebSocket support requiring no new HTTP framework dependency. It gives true bidirectional, low-latency push (meets the 5-second SC-001 target trivially) and is well understood by the existing Python/FastAPI team. Server-Sent Events (SSE) was also viable (simpler, HTTP-native, auto-reconnect built into `EventSource`) but was rejected because the browser `EventSource` API cannot set custom headers for auth (would force token-in-URL for both SSE and WS anyway, so SSE's main ergonomic advantage disappears) and native `EventSource` support does not exist in React Native, which would force a polyfill for mobile while WebSocket is natively supported by React Native without any extra library.

**Alternatives considered**:
- *SSE*: rejected — no native mobile support, one-way only (fine for this use case, but no benefit over WS given equal auth complexity).
- *Long-polling*: rejected — higher latency, higher server load per update than WS, more complex to implement correctly than the fallback polling already required by FR-005.
- *Third-party managed push service (e.g. Pusher, Ably)*: rejected — introduces an external paid dependency and a new secret/credential to manage for a problem the existing stack (FastAPI + Redis) already solves; also raises data-residency questions for a multi-tenant ERP handling business-sensitive data.

## Decision 2: Fan-out across backend processes

**Decision**: Redis Pub/Sub, using the already-configured `REDIS_URL`. Each backend worker process subscribes to per-business Redis channels (`sync:business:{businessId}`) and re-broadcasts matching messages to its own locally-held WebSocket connections.

**Rationale**: `uvicorn --reload` / production deployments commonly run multiple worker processes; an in-memory pub/sub within a single process would miss clients connected to a different worker than the one that handled the write. Redis is already a declared dependency (`redis==5.2.1`, `REDIS_URL` in `config.py`) but currently unused, so this reuses existing infrastructure rather than adding a new one. Redis Pub/Sub is simple, well-supported by `redis.asyncio`, and doesn't require message durability (a missed live event is recoverable via the reconnect catch-up flow in FR-004, so at-most-once delivery is acceptable).

**Alternatives considered**:
- *In-process only (no Redis)*: rejected — breaks under any multi-worker deployment, which is the realistic production topology for a FastAPI app.
- *MongoDB Change Streams* (watch the actual collections instead of explicit publish calls): considered attractive because it requires no per-service publish call, but rejected for v1 because (a) it requires MongoDB to run as a replica set, which is an infra change beyond this feature's scope, (b) change-stream events are raw Mongo diffs and don't carry the business-level "what changed and why" context needed for the notification text in FR-012, and (c) it would still need a fan-out layer (Redis or similar) on top for multi-worker delivery, so it doesn't actually remove Redis from the design — it only removes the explicit publish call at a steep infra cost. Documented here as a good v2 candidate if per-service instrumentation proves error-prone.
- *Celery/APScheduler task queue for event delivery*: rejected — these are designed for deferred/scheduled work, not low-latency fan-out; would add latency against the 5-second SC-001 target.

## Decision 3: WebSocket authentication & authorization

**Decision**: Client passes the existing short-lived JWT access token as a query parameter on the WebSocket handshake URL (`wss://.../api/v1/ws?token=...`), reusing `decode_access_token` from `app/core/security.py`. On connect, the server decodes the token, derives `businessId`, `role`, and `assignedStore` exactly as `get_current_user` does for REST, and only subscribes that connection to Redis channels the user is authorized for. Unauthorized or invalid-token connection attempts are closed immediately with a WS close code and logged server-side (no error is surfaced to the client beyond the closed connection), per the FR-002 clarification.

**Rationale**: Browsers' native `WebSocket` API cannot set custom `Authorization` headers on the handshake request, so the token must travel via the URL or a post-connect auth message. Query-param token is simpler to implement symmetrically on web and React Native (both support setting the URL directly) than a "connect, then send an auth message, then wait for ack" sub-protocol, and it reuses the existing access-token/refresh-token model without inventing a new one. Because access tokens are already short-lived (15 minutes per `config.py`) and delivered over TLS in production, the exposure window of a token appearing in a URL (e.g., in server access logs) is bounded and consistent with the existing security posture; this is called out explicitly so it can be revisited if the team wants a stricter scheme later.

**Alternatives considered**:
- *Header-based auth on handshake*: rejected — not supported by browser `WebSocket`.
- *Cookie-based session auth*: rejected — the app doesn't use cookie sessions today (JWT bearer only); introducing cookies just for WS would add a second auth mechanism to maintain.
- *Post-connect auth message*: rejected for v1 as unnecessary complexity — it solves the same problem as the query-param approach with an extra round trip, at the cost of a brief window where an unauthenticated socket is open.

## Decision 4: Client-side data application strategy

**Decision**: On receiving a change event, the client (web and mobile) calls TanStack Query's `queryClient.invalidateQueries` targeted at the query key(s) mapped from the event's `entity` field (see `data-model.md` for the event shape and `contracts/` for the entity→query-key mapping), triggering a re-fetch of just the affected data through the existing REST endpoints. This is combined with `queryClient.setQueryData` for simple single-record updates where the event payload already contains the full updated record, avoiding an extra round trip.

**Rationale**: This reuses 100% of the existing REST API and React Query hooks (`frontend/src/features/*/hooks/*`, mobile equivalents) — the WebSocket layer only tells the client *what* changed, not *how to render it*, which keeps the sync feature additive rather than a rewrite of data-fetching logic (matches the Assumptions section of `spec.md`: "this feature adds a notification/propagation layer on top rather than replacing existing data-fetching logic").

**Alternatives considered**:
- *Ship full updated documents over the socket for every entity and bypass REST entirely*: rejected — would require duplicating every response-shaping/permission-filtering rule already implemented in the REST layer inside the WebSocket handler, doubling the surface area to maintain.
- *Global "something changed, refetch everything" signal with no entity targeting*: rejected — would cause unnecessary refetch storms across unrelated screens, hurting the SC-004 concurrency target.

## Decision 5: Reconnect / catch-up behavior (FR-004)

**Decision**: On WebSocket reconnect (whether after a network blip or app resume from background), the client invalidates all currently-mounted React Query queries for the active screen(s), forcing a fresh REST fetch. No event-replay/backlog mechanism is implemented in v1 — the client does not try to replay every individual event it missed while disconnected; it simply resyncs to current server truth.

**Rationale**: Given FR-006's "all viewers converge on the same final, consistent state" requirement, a full resync to current truth trivially satisfies convergence without needing a fragile event-ordering/replay log. This is simpler to implement correctly and matches the "last confirmed write wins" conflict model already documented in `spec.md`'s Assumptions.

**Alternatives considered**:
- *Event backlog with sequence numbers, replayed on reconnect*: rejected for v1 — real complexity (needs persistent per-client cursor state) for a benefit (seeing intermediate states) the spec doesn't require; SC-003 only requires the *final* state to be caught up within 10 seconds, not every intermediate change.

## Decision 6: Fallback polling (FR-005, 15s interval)

**Decision**: Each client tracks WebSocket connection health in a shared `SyncConnectionContext` (web: React Context; mobile: equivalent context/provider). When the socket is `disconnected` for longer than a short grace period (a few seconds, to avoid flapping on brief reconnects), affected React Query hooks switch on `refetchInterval: 15_000`; when the socket reports `connected` again, `refetchInterval` is turned back off (relying purely on push) and an immediate catch-up invalidation runs per Decision 5.

**Rationale**: TanStack Query already supports per-query `refetchInterval`, so the fallback is a configuration toggle on existing hooks rather than a parallel polling system. This directly implements the clarified 15-second interval from `spec.md`.

## Decision 7: Toast/banner notification (FR-012)

**Decision**: Web reuses the already-installed `sonner` toast library. Mobile needs a new lightweight in-app banner component (none exists today) — a simple top-of-screen banner reusing existing mobile design primitives (`mobile/src/components/`), auto-dismissing after a few seconds, consistent with the "explicit but non-blocking" requirement.

**Rationale**: Reuses `sonner` on web per existing `CLAUDE.md` tech stack notes ("Sonner for toast notifications"). Mobile has no equivalent yet, so this is new but intentionally minimal — a single reusable banner component, not a new notification framework.

## Summary of technology decisions

| Concern | Decision |
|---|---|
| Push transport | WebSocket via FastAPI/Starlette native support |
| Multi-worker fan-out | Redis Pub/Sub (reusing existing `REDIS_URL`) |
| WS auth | JWT access token as connect-time query parameter, decoded via existing `decode_access_token` |
| Client update strategy | Targeted `queryClient.invalidateQueries` / `setQueryData` via entity→query-key mapping, on top of existing REST hooks |
| Reconnect/catch-up | Full resync (invalidate mounted queries), no event replay log |
| Fallback when WS unavailable | React Query `refetchInterval: 15_000` toggle, driven by connection-state context |
| Notification UI | `sonner` (web, existing dep); new minimal banner component (mobile) |
