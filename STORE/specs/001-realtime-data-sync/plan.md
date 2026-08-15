# Implementation Plan: Real-Time Cross-App Data Sync

**Branch**: `001-realtime-data-sync` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-realtime-data-sync/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Data written on one client (mobile or web) currently only becomes visible on other clients after a manual page refresh, because the frontend's React Query cache has no push mechanism and a 30-second stale time. This plan adds a WebSocket-based push layer (`/api/v1/ws`) backed by Redis Pub/Sub for multi-worker fan-out: backend services publish a `SyncEvent` after every tenant-scoped write, connected web and mobile clients receive it and invalidate the matching React Query keys (reusing all existing REST endpoints/hooks — no data-fetching logic is replaced), show an explicit toast/banner notification, and fall back to 15-second polling when a live connection can't be maintained. See `research.md` for the seven technology decisions and their rationale.

## Technical Context

**Language/Version**: Python 3.13 (backend, existing); TypeScript (frontend & mobile, existing)

**Primary Dependencies**: FastAPI/Starlette native WebSocket support (backend, new usage of existing framework); `redis` 5.2.1 via `redis.asyncio` (backend, already a declared dependency, currently unused — this feature wires it up); TanStack Query (frontend & mobile, existing); `sonner` (frontend, existing, reused for FR-012 toasts); native `WebSocket` (React Native, no new mobile dependency required)

**Storage**: No new persisted storage — MongoDB document shapes are unchanged. Redis is used only as a transient Pub/Sub bus (no persistence/durability requirement, per Decision 2 in `research.md`).

**Testing**: `pytest` (backend, existing) for WebSocket auth/authorization and event-publishing unit tests; manual QA via `quickstart.md` for cross-client scenarios (frontend/mobile have no automated test suite today, per `CLAUDE.md`).

**Target Platform**: Existing targets unchanged — web dashboard (browsers via Vite), mobile (iOS/Android/Expo Web via React Native/Expo), backend (Linux server via Uvicorn/FastAPI).

**Project Type**: Web application + mobile app, both backed by one FastAPI service (matches existing repo layout: `backend/`, `frontend/`, `mobile/`).

**Performance Goals**: Propagate a data change to all other actively-connected, authorized clients within 5 seconds (SC-001); support ≥50 concurrent live sessions per business without degrading delivery time (SC-004).

**Constraints**: Must not alter existing REST API contracts or MongoDB schemas (additive only, per `spec.md` Assumptions); must respect existing multi-tenant/RBAC boundaries on every delivered event (FR-002); must degrade to 15-second polling, never to indefinite staleness, when a live connection is unavailable (FR-005).

**Scale/Scope**: Every tenant-scoped data type in the system (FR-003, post-clarification) — enumerated in `data-model.md`'s "Entity coverage" table across ~12 service modules; not limited to a fixed subset.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is an unfilled template (no project-specific principles have been ratified) — there are no formal constitutional gates to evaluate. In its place, this plan is checked against the binding architectural rules in `CLAUDE.md` (which the project treats as authoritative and which override default behavior):

| Rule (from `CLAUDE.md`) | Compliance in this design |
|---|---|
| Layering: `api/` → `services/` → `repositories/` → `database/`, no layer-skipping | `SyncEvent` publishing is called from `services/*.py` methods after a successful write, never from `api/` or `repositories/`. The WebSocket endpoint itself lives in `api/` (as a thin connection/auth handler) and delegates subscription management to a new `services/sync_service.py`. |
| Never omit `businessId` in a query/event | Every `SyncEvent` requires `businessId` (see `data-model.md` validation rules); server re-checks `businessId`/`assignedStore` scope on every delivered message, not just at connect time (`contracts/websocket-protocol.md`). |
| Always use Motor (async), never sync PyMongo | No new MongoDB access is introduced by this feature — it only adds a Redis Pub/Sub side-channel after existing async Motor writes complete. |
| RBAC enforced via `app/dependencies/` | WS handshake reuses the same JWT decoding (`app/core/security.py::decode_access_token`) and the same `role`/`assignedStore` fields as `get_current_user`, so authorization stays centralized rather than reimplemented. |
| Error handling via `AppException` / structured responses | Unauthorized WS attempts close the socket with a defined close code (`4401`) and are logged, rather than raising an uncaught exception (`contracts/websocket-protocol.md`). |
| API versioning under `/api/v1/...` | New endpoint is `/api/v1/ws`, consistent with existing versioning. |

**Result**: PASS — no violations requiring justification in Complexity Tracking.

## Post-Design Constitution Check

*Re-checked after Phase 1 (`data-model.md`, `contracts/`, `quickstart.md`).*

No new violations introduced during design. The design deliberately avoids new MongoDB schema changes, new REST endpoints beyond the single WS upgrade route, and any bypass of existing RBAC/multi-tenancy dependencies. **Result**: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-realtime-data-sync/
├── plan.md                          # This file (/speckit-plan command output)
├── research.md                      # Phase 0 output (/speckit-plan command)
├── data-model.md                    # Phase 1 output (/speckit-plan command)
├── quickstart.md                    # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── websocket-protocol.md        # Phase 1 output (/speckit-plan command)
│   └── entity-query-key-map.md      # Phase 1 output (/speckit-plan command)
└── tasks.md                         # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This is the existing three-app layout (`backend/`, `frontend/`, `mobile/`) described in `CLAUDE.md`. This feature adds files within that existing structure — no new top-level project is created.

```text
backend/app/
├── api/
│   └── ws.py                        # NEW: WebSocket upgrade endpoint (/api/v1/ws), thin — auth + delegate to sync_service
├── services/
│   ├── sync_service.py              # NEW: SyncEvent construction, Redis publish, per-connection subscription/broadcast loop
│   ├── inventory_service.py         # MODIFIED: publish SyncEvent after mutations (and similarly across the full entity list in data-model.md)
│   ├── sale_service.py              # MODIFIED: publish SyncEvent after mutations
│   ├── sales_service.py             # MODIFIED: publish SyncEvent after mutations
│   ├── recipe_service.py            # MODIFIED: publish SyncEvent after mutations
│   ├── attendance_service.py        # MODIFIED: publish SyncEvent after mutations
│   ├── store_service.py             # MODIFIED: publish SyncEvent after mutations
│   ├── store_inventory_service.py   # MODIFIED: publish SyncEvent after mutations
│   ├── allocation_service.py        # MODIFIED: publish SyncEvent after mutations
│   ├── assignment_service.py        # MODIFIED: publish SyncEvent after mutations
│   ├── food_service.py              # MODIFIED: publish SyncEvent after mutations
│   ├── user_service.py              # MODIFIED: publish SyncEvent after mutations
│   └── inventory_log_service.py     # MODIFIED: publish SyncEvent after mutations
├── schemas/
│   └── sync.py                      # NEW: SyncEvent Pydantic schema (data-model.md)
├── core/
│   └── redis_client.py              # NEW: Redis connection lifecycle (mirrors app/database/client.py's pattern for Motor)
└── dependencies/
    └── ws_auth.py                   # NEW: WebSocket-flavored token auth (query-param JWT decode, reuses core/security.py)

frontend/src/
├── lib/
│   ├── sync/
│   │   ├── syncClient.ts            # NEW: WebSocket connection manager, reconnect/backoff, SyncConnectionState
│   │   ├── syncEventHandler.ts      # NEW: resolveInvalidations(event) — entity → query key mapping (contracts/entity-query-key-map.md)
│   │   └── SyncConnectionContext.tsx # NEW: React context exposing connection status; drives refetchInterval fallback
│   └── query-client.ts              # MODIFIED: expose queryClient to syncEventHandler for invalidate/setQueryData calls
└── api/
    └── queryKeys.ts                 # MODIFIED: add attendance/ticket key factories referenced in entity-query-key-map.md

mobile/src/
├── lib/
│   └── sync/                        # NEW: mirrors frontend/src/lib/sync/ (WebSocket manager + event handler are logic-identical; React Native WebSocket API differs slightly from browser but interface stays the same)
│       ├── syncClient.ts
│       ├── syncEventHandler.ts
│       └── SyncConnectionContext.tsx
├── components/
│   └── SyncBanner.tsx               # NEW: minimal toast/banner component for FR-012 (no existing mobile toast lib)
└── api/
    └── queryKeys.ts                 # NEW (if not already present) or MODIFIED: mobile-side entity query key factories
```

**Structure Decision**: Extend the existing three-app monorepo layout in place. Backend changes are additive within `app/services/` (one new `sync_service.py` plus a publish call added to each existing service that mutates tenant data) and one new thin `app/api/ws.py` route, consistent with the mandatory `api → services → repositories → database` layering. Frontend and mobile each get a new `lib/sync/` module with logic-equivalent WebSocket-manager and event-handler code (kept as separate per-app files rather than a shared package, since `frontend` and `mobile` are managed as independent `npm` projects with no existing shared-package tooling in this repo — introducing a monorepo package manager is out of scope for this feature). Task-level breakdown of exactly which service files change in which task, and whether the sync logic should later be extracted to a shared package, is deferred to `/speckit-tasks`.

## Complexity Tracking

No entries — Constitution Check (see above) passed with no violations to justify.
