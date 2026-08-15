---

description: "Task list for feature implementation"
---

# Tasks: Real-Time Cross-App Data Sync

**Input**: Design documents from `/specs/001-realtime-data-sync/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required for user stories), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in the spec and no TDD approach was requested. `pytest` tasks are included only for the WebSocket auth/authorization boundary (T009, T010) because that boundary directly implements FR-002's security clarification and is cheap to regression-test; broader coverage is left to manual validation via `quickstart.md` (T041), consistent with `CLAUDE.md`'s note that frontend/mobile have no automated test suite today.

**Organization**: Tasks are grouped by user story (P1/P2/P3 from `spec.md`) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes exact file paths, matching the Structure Decision in `plan.md`

## Path Conventions

Existing three-app monorepo layout (`backend/`, `frontend/`, `mobile/`), per `plan.md`'s Structure Decision. No new top-level projects.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire up the one new runtime dependency (Redis) and the new wire-format schema, with no behavior changes yet.

- [X] T001 Add `redis.asyncio` connection lifecycle manager in `backend/app/core/redis_client.py`, mirroring the `MongoClientManager` pattern in `backend/app/database/client.py` (a `RedisClientManager` class exposing `.client()` built from `settings.redis_url`, plus a module-level `redis_manager` instance and an `async def close()`).
- [X] T002 [P] Define the `SyncEvent` Pydantic schema in `backend/app/schemas/sync.py` per `data-model.md` (`eventId`, `entity`, `action`, `businessId`, `storeId`, `recordId`, `payload`, `actorUserId`, `occurredAt`), including the validation rule that `action == "deleted"` implies `payload is None`.
- [X] T003 [P] Confirm `REDIS_URL` is documented for local dev: add `REDIS_URL=redis://localhost:6379/0` to `backend/.env` if not already present, and note the new local Redis requirement next to the existing MongoDB setup instructions in `CLAUDE.md`'s Backend Setup section.

**Checkpoint**: Redis is reachable from the backend process; `SyncEvent` schema exists but nothing publishes or consumes it yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The WebSocket endpoint, auth, publish/subscribe plumbing, and client-side connection managers that every user story depends on. No entity-specific sync behavior yet — this phase proves the pipe works end-to-end with a trivial event.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Implement `SyncService` in `backend/app/services/sync_service.py`: `async def publish(event: SyncEvent) -> None` (publishes JSON to Redis channel `sync:business:{event.businessId}` via `redis_manager`), and an `async def subscribe(business_id: str) -> AsyncIterator[SyncEvent]` that yields events from that channel for a live connection to forward. Depends on T001, T002.
- [X] T005 Implement WebSocket-flavored token auth in `backend/app/dependencies/ws_auth.py`: `async def authenticate_ws(token: str) -> CurrentUser | None`, reusing `decode_access_token` from `backend/app/core/security.py` (same decode path as `get_current_user` in `backend/app/dependencies/auth.py`), returning `None` on any decode failure instead of raising (per `contracts/websocket-protocol.md`'s silent-reject behavior).
- [X] T006 Implement the `/api/v1/ws` upgrade endpoint in `backend/app/api/ws.py`: accept the connection, read `token` query param, call `authenticate_ws` (T005); on failure close with WS code `4401` and `logging.getLogger(__name__).warning(...)` the attempt (business id unknown, so log IP/token-prefix only) per the FR-002 clarification; on success, register a `ClientSubscription` (per `data-model.md`), loop `SyncService.subscribe(business_id)` (T004) filtering by the connection's `role`/`assignedStore` scope, and send each authorized `SyncEvent` as JSON. Handle an optional `{"type": "ping"}` client message by replying `{"type": "pong"}`. Depends on T004, T005.
- [X] T007 Register the new router in `backend/app/api/__init__.py` (add `ws` to `api_router`) and wire Redis lifecycle into `backend/app/main.py`'s `startup`/`shutdown` handlers (`redis_manager.client()` on startup, `await redis_manager.close()` on shutdown), mirroring how `mongo_manager` is already wired. Depends on T001, T006.
- [X] T008 [P] Implement the web WebSocket connection manager in `frontend/src/lib/sync/syncClient.ts`: connects to `${VITE_API_BASE_URL}/api/v1/ws?token=...` using the current access token (reuse token accessors from `frontend/src/lib/tokenStore.ts`), exposes `onEvent(handler)`, tracks `SyncConnectionState` (`connecting`/`connected`/`disconnected`/`polling-fallback`) per `data-model.md`, and implements exponential-backoff reconnect per `contracts/websocket-protocol.md`.
- [X] T009 [P] Implement `SyncConnectionContext` in `frontend/src/lib/sync/SyncConnectionContext.tsx`: a React context/provider wrapping `syncClient.ts` (T008), exposing current `SyncConnectionState.status` to consumers, and mount the provider inside `frontend/src/main.tsx` alongside the existing `QueryClientProvider`.
- [X] T010 [P] Implement `resolveInvalidations(event)` in `frontend/src/lib/sync/syncEventHandler.ts` per `contracts/entity-query-key-map.md`'s resolution rule, returning the query keys to invalidate/remove for a given `SyncEvent`, and wire it to `syncClient.ts`'s `onEvent` in `frontend/src/main.tsx` so every received event calls `queryClient.invalidateQueries` (and `queryClient.removeQueries` for `action === "deleted"` detail keys) against the shared `queryClient` from `frontend/src/lib/query-client.ts`.
- [X] T011 [P] Implement the mobile WebSocket connection manager in `mobile/src/lib/sync/syncClient.ts`, functionally mirroring T008 but using the mobile base-URL resolution and token accessors already in `mobile/src/api/client.ts` (`resolveBaseUrl()`, `getAccessToken()`), and React Native's native `WebSocket` global (no new package required).
- [X] T012 [P] Implement `SyncConnectionContext` in `mobile/src/lib/sync/SyncConnectionContext.tsx` mirroring T009, mounted in `mobile/src/AppRoot.tsx` alongside the existing `QueryClientProvider`.
- [X] T013 [P] Implement `resolveInvalidations(event)` in `mobile/src/lib/sync/syncEventHandler.ts` mirroring T010. Since mobile currently inlines query keys directly in screens (e.g. `['attendance', 'today', userId]` in `mobile/src/screens/attendance/AttendanceScreen.tsx`) rather than using a shared factory module, this task also extracts the query-key prefixes actually in use today (`attendance`, `store`, `tickets`, per `mobile/src/screens/**`) into `mobile/src/api/queryKeys.ts` so `resolveInvalidations` has stable factories to target, matching `contracts/entity-query-key-map.md`.
- [X] T014 Add `attendanceKeys` and `ticketKeys` factories to `frontend/src/api/queryKeys.ts` (currently missing, per `contracts/entity-query-key-map.md`'s "TBD" note), matching the query keys actually used by `frontend/src/features/attendance/hooks/use-attendance.ts` and the tickets feature's existing query hooks.

**Checkpoint**: A connected, authenticated client on web or mobile can receive a manually-published test `SyncEvent` and have it invalidate the correct query key. No real service publishes events yet — that starts in Phase 3.

---

## Phase 3: User Story 1 - Worker updates data, dashboard reflects it instantly (Priority: P1) 🎯 MVP

**Goal**: Mobile writes to inventory, sales, and attendance become visible on the web dashboard automatically, without a manual refresh, within 5 seconds.

**Independent Test**: With the dashboard open on one screen and the mobile app on another, perform an inventory adjustment (or sale, or clock-in) on mobile and confirm the dashboard's corresponding view updates within a few seconds with no manual refresh (per `quickstart.md` Scenario 1).

### Implementation for User Story 1

- [X] T015 [US1] Publish `SyncEvent`s from `backend/app/services/inventory_service.py`: after every method that creates/updates/deletes an ingredient record, call `SyncService.publish` (T004) with `entity="inventory"`, the correct `action`, `businessId`, `recordId`, and `payload` snapshot.
- [X] T016 [US1] Publish `SyncEvent`s from `backend/app/services/store_inventory_service.py` (allocations/returns affecting store-level stock) with `entity="storeInventory"`, including `storeId`.
- [X] T017 [P] [US1] Publish `SyncEvent`s from `backend/app/services/sale_service.py` and `backend/app/services/sales_service.py` with `entity="sale"`, including `storeId`.
- [X] T018 [P] [US1] Publish `SyncEvent`s from `backend/app/services/attendance_service.py`'s `clock_in`, `clock_out`, and `mark_status` methods with `entity="attendance"`, including `storeId` derived from the acting user's `assignedStore`.
- [X] T019 [US1] Wire `resolveInvalidations` (T010/T013) entries for `inventory`, `storeInventory`, `sale`, and `attendance` on both web and mobile per `contracts/entity-query-key-map.md`'s table, targeting the existing hooks in `frontend/src/features/inventory/hooks/use-ingredients.ts`, `frontend/src/features/sales/hooks/use-sales.ts`, and their mobile equivalents. Depends on T015-T018.
- [X] T020 [US1] Add the FR-012 notification: on web, call `sonner`'s `toast()` from within the T010 event handler for these four entities with a message derived from `entity`/`action`/`actorUserId`; on mobile, create `mobile/src/components/SyncBanner.tsx` (a minimal auto-dismissing top-of-screen banner, no existing mobile toast lib per `research.md` Decision 7) and trigger it from the T013 event handler.
- [X] T021 [US1] Suppress self-notifications: in both T010 and T013 event handlers, skip the FR-012 toast/banner when `event.actorUserId` matches the current user's `userId` (the acting user already sees their own change locally), while still applying the cache invalidation.

**Checkpoint**: User Story 1 is fully functional and independently testable — `quickstart.md` Scenario 1 passes for inventory, sales, and attendance.

---

## Phase 4: User Story 2 - Changes made on the web dashboard reflect everywhere else automatically (Priority: P2)

**Goal**: Edits made on any web dashboard session (recipes, store settings, tickets, and the remaining entities required by FR-003's full-scope clarification) propagate automatically to other dashboard sessions and to mobile.

**Independent Test**: Open the web dashboard in two separate browser sessions, edit a record in one, and confirm the other updates automatically without a refresh (per `quickstart.md` Scenario 2).

### Implementation for User Story 2

- [X] T022 [P] [US2] Publish `SyncEvent`s from `backend/app/services/recipe_service.py` with `entity="recipe"`.
- [X] T023 [P] [US2] Publish `SyncEvent`s from `backend/app/services/store_service.py` with `entity="store"` (business-wide, `storeId=None`).
- [X] T024 [P] [US2] Publish `SyncEvent`s from `backend/app/services/allocation_service.py` with `entity="allocation"`, including `storeId`.
- [X] T025 [P] [US2] Publish `SyncEvent`s from `backend/app/services/assignment_service.py` with `entity="assignment"`, including `storeId`.
- [X] T026 [P] [US2] Publish `SyncEvent`s from `backend/app/services/food_service.py` with `entity="food"`.
- [X] T027 [P] [US2] Publish `SyncEvent`s from `backend/app/services/user_service.py` with `entity="user"` (business-wide, `storeId=None`).
- [X] T028 [P] [US2] Publish `SyncEvent`s from `backend/app/services/inventory_log_service.py` with `entity="inventory"` action `updated` (log entries reflect ingredient-quantity changes; reuse the `inventory` entity rather than inventing a separate one, since `contracts/entity-query-key-map.md` maps `inventory` to the ingredient-catalog keys these logs affect).
- [X] T029 [US2] Ticket sync: `backend/app/api/tickets.py` currently only calls `NotificationService.placeholder(...)` scaffolding with no real persistence (confirmed by reading the file — every handler returns a placeholder, there is no ticket repository/service yet). Publishing `SyncEvent`s for tickets is blocked on real ticket CRUD existing; this task is to flag that dependency explicitly (add a `# TODO(sync): wire SyncEvent once ticket persistence exists` comment at each placeholder call site in `backend/app/api/tickets.py`) rather than fake an event for data that isn't actually persisted. Ticket sync becomes a follow-up task once ticket CRUD ships.
- [X] T030 [US2] Wire `resolveInvalidations` (T010/T013) entries for `recipe`, `store`, `allocation`, `assignment`, `food`, and `user` on both web and mobile per `contracts/entity-query-key-map.md`, reusing the existing `recipeKeys`, `storeKeys`, `allocationKeys`, `assignmentKeys`, `foodKeys`, `userKeys` factories already present in `frontend/src/api/queryKeys.ts`, and their mobile counterparts from T013. Depends on T022-T028.
- [X] T031 [US2] Extend the FR-012 notification (T020's toast/banner call sites) to cover the entities added in this phase.
- [X] T032 [US2] Deletion handling: verify (and add `queryClient.removeQueries` calls where missing) that `action === "deleted"` events for `recipe`, `store`, `allocation`, `food`, and `user` clear any open `detail(recordId)` cache entry on both web and mobile, per `contracts/entity-query-key-map.md`'s deletion-handling rule and `spec.md`'s "viewing a deleted record" edge case.

**Checkpoint**: User Stories 1 AND 2 both work independently — `quickstart.md` Scenario 2 passes, and FR-003's full-scope requirement is met for every entity with real backend persistence today (tickets excluded per T029's documented blocker).

---

## Phase 5: User Story 3 - Sync degrades gracefully when connectivity is poor (Priority: P3)

**Goal**: Clients recover automatically after connectivity loss, and fall back to periodic polling when a live connection can't be maintained at all.

**Independent Test**: Disconnect a device's network, make a change elsewhere in the system, then restore the device's network connection and confirm the device's view updates automatically within a short time without a manual refresh (per `quickstart.md` Scenario 3).

### Implementation for User Story 3

- [X] T033 [P] [US3] Implement reconnect catch-up in `frontend/src/lib/sync/syncClient.ts` (T008): on transition from `disconnected`/`polling-fallback` back to `connected`, call `queryClient.invalidateQueries()` (all currently-mounted queries) per `research.md` Decision 5, before resuming normal event-driven invalidation.
- [X] T034 [P] [US3] Implement the equivalent reconnect catch-up in `mobile/src/lib/sync/syncClient.ts` (T011), additionally accounting for React Native app foreground/background transitions (subscribe to `AppState` changes and treat a resume-from-background the same as a reconnect, per `spec.md`'s "device put to sleep" edge case).
- [X] T035 [US3] Implement the 15-second fallback-polling toggle: in `SyncConnectionContext` (T009 web / T012 mobile), when `status` has been `disconnected` for longer than a short grace period (a few seconds, to avoid flapping), expose a `pollingFallbackActive: boolean` flag; consuming hooks (e.g. `use-ingredients.ts`, `use-sales.ts`, and mobile equivalents) read this flag to set `refetchInterval: pollingFallbackActive ? 15_000 : false` per `research.md` Decision 6.
- [X] T036 [US3] Mobile offline-queue integration (FR-007): in `mobile/src/db/` (the existing SQLite offline queue used for sales/inventory recorded while offline), after a queued action successfully syncs to the server, confirm the resulting REST write already triggers the relevant service's `SyncService.publish` call (from Phase 3/4 tasks) — no separate publish path is needed since the offline queue ultimately calls the same REST endpoints backed by the same services. Add an integration check in the offline-sync completion handler to log a warning if a queued-action sync completes but no corresponding sync event effect (cache update) is observed within a few seconds, to catch regressions.
- [X] T037 [US3] Backend-side idle-connection detection: in `backend/app/api/ws.py` (T006), respond to client `ping` messages with `pong` and close connections that have sent no `ping` and had no outbound event for longer than a defined idle window, so dead TCP connections (e.g. a phone that lost signal without a clean close) don't linger as phantom `ClientSubscription`s consuming Redis fan-out.

**Checkpoint**: All three user stories are independently functional — `quickstart.md` Scenarios 1-3 all pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Security validation, load characteristics, and final documentation, cutting across all stories.

- [X] T038 [P] Backend test: `backend/tests/test_ws_auth.py` — verify `authenticate_ws` (T005) rejects missing/expired/malformed tokens and accepts valid ones, and that `/api/v1/ws` (T006) closes with code `4401` and logs the attempt on rejection (per FR-002's clarification and `quickstart.md` Scenario 5).
- [X] T039 [P] Backend test: `backend/tests/test_sync_service.py` — verify `SyncService.publish`/`subscribe` (T004) round-trips a `SyncEvent` through Redis correctly, and that a connection scoped to one `businessId`/`assignedStore` never receives events for another (per FR-002 and `quickstart.md` Scenario 5's cross-store isolation check).
- [X] T040 Update `CLAUDE.md`'s Environment Variables and Quick Start sections to note the new local Redis requirement for running the backend with live sync enabled (already partially covered by T003; this task ensures the top-level dev-setup docs, not just `.env`, reflect it).
- [X] T041 Run the full `quickstart.md` validation guide (all 5 scenarios) end-to-end against a locally running backend + frontend + mobile, confirming SC-001 through SC-005 hold; record any deviations as follow-up tasks rather than silently accepting them.
- [X] T042 Load-test SC-004: write a small script (e.g. `backend/tests/load/ws_concurrency_check.py`, not part of the pytest suite) that opens ≥50 concurrent authenticated WebSocket connections for one business, triggers a batch of writes, and measures delivery latency to confirm the 5-second SC-001 target holds at that concurrency per SC-004.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational completion. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational completion. Independently testable from US1 (different entities), though both exercise the same underlying pipe.
- **User Story 3 (Phase 5)**: Depends on Foundational completion. Builds on the connection-state plumbing from Phase 2 (T009/T012) — does not require US1 or US2's entity wiring to be functionally correct, but is most easily *validated* once at least one entity (US1) is live end-to-end.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependency on US2 or US3.
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) — no dependency on US1, though T030 reuses `resolveInvalidations` scaffolding also touched by T019.
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) — no dependency on US1/US2, but validating it (T041) is easiest once US1 is live.

### Within Each User Story

- Backend service publish tasks (e.g. T015-T018, T022-T028) before the frontend/mobile wiring tasks that consume them (T019, T030).
- Core sync pipe (Phase 2) before any entity-specific work.
- Story complete before moving to the next priority, if working sequentially.

### Parallel Opportunities

- T002 and T003 can run in parallel with each other (and after T001).
- T008-T013 (all frontend/mobile Phase 2 tasks) can run in parallel with each other and with T004-T007 (backend Phase 2 tasks), since they touch disjoint files — but the *end-to-end* Foundational checkpoint requires both sides done.
- Within US1: T017 and T018 can run in parallel (different service files); T015/T016 touch related but distinct inventory files and can also run in parallel with T017/T018.
- Within US2: T022-T028 (seven distinct service files) can all run in parallel.
- Within US3: T033 and T034 can run in parallel (web vs. mobile, distinct files).
- T038 and T039 (Polish tests) can run in parallel.

---

## Parallel Example: User Story 2

```bash
# Launch all entity-publish tasks for User Story 2 together (distinct service files):
Task: "Publish SyncEvents from backend/app/services/recipe_service.py with entity=recipe"
Task: "Publish SyncEvents from backend/app/services/store_service.py with entity=store"
Task: "Publish SyncEvents from backend/app/services/allocation_service.py with entity=allocation"
Task: "Publish SyncEvents from backend/app/services/assignment_service.py with entity=assignment"
Task: "Publish SyncEvents from backend/app/services/food_service.py with entity=food"
Task: "Publish SyncEvents from backend/app/services/user_service.py with entity=user"
Task: "Publish SyncEvents from backend/app/services/inventory_log_service.py with entity=inventory"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run `quickstart.md` Scenario 1 independently
5. Deploy/demo if ready — this alone fixes the exact pain point reported ("I change something in mobile, frontend didn't reflect")

### Incremental Delivery

1. Setup + Foundational → pipe works end-to-end with a test event
2. Add User Story 1 → validate Scenario 1 → deploy/demo (MVP!)
3. Add User Story 2 → validate Scenario 2 → deploy/demo (full FR-003 scope, minus tickets pending T029's blocker)
4. Add User Story 3 → validate Scenario 3 → deploy/demo (resilience under real network conditions)
5. Polish (Phase 6) → security/load validation, docs

### Parallel Team Strategy

With multiple developers, after Foundational (Phase 2) is done:
- Developer A: User Story 1 (T015-T021)
- Developer B: User Story 2 (T022-T032)
- Developer C: User Story 3 (T033-T037)

Stories complete and integrate independently since they touch disjoint service files and share only the Phase 2 plumbing.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- T029 documents a real scope gap (tickets have no backend persistence yet) rather than papering over it — do not fabricate ticket sync against placeholder data.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently.
- Full FR-003 "every data type" coverage is reached at the end of Phase 4 (T030), except tickets (T029).
