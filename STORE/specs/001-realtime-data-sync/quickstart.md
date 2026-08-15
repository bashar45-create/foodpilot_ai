# Quickstart: Validating Real-Time Cross-App Data Sync

## Prerequisites

- MongoDB and Redis running locally (Redis is a new runtime dependency for this feature — `redis-server` or `docker run -p 6379:6379 redis` if not already running; `REDIS_URL` in `backend/.env` must point to it).
- Backend running: `cd backend && uvicorn app.main:app --reload --port 8000`
- Frontend running: `cd frontend && npm run dev`
- Mobile running (device/simulator or Expo Web): `cd mobile && npm run start`
- Two authenticated sessions available for the same business: e.g. one manager logged into the web dashboard, one worker logged into the mobile app (or two browser tabs/profiles both logged in, for the User Story 2 scenario).

## Scenario 1 — Mobile write reflects on web without refresh (User Story 1, SC-001)

1. On web, open the Inventory screen for a store and leave it open.
2. On mobile, log in as a worker assigned to that store and perform a stock allocation or return for the same store.
3. **Expected**: within 5 seconds, the web Inventory screen's counts update with no manual refresh, and a toast/banner appears per FR-012.
4. Repeat for a sale recorded on mobile while the web Sales/Analytics screen is open, and for a clock-in/out on mobile while the web Attendance screen is open (User Story 1, Acceptance Scenarios 2–3).

## Scenario 2 — Web edit reflects on another web session and on mobile (User Story 2)

1. Open the web dashboard in two separate browser sessions (different profiles or one normal + one incognito), both logged in as managers of the same business, both viewing the Recipes list.
2. Edit a recipe in session A.
3. **Expected**: session B's recipe list updates automatically within 5 seconds, with a toast/banner notification.
4. Update a ticket's status on web while a mobile session is viewing that ticket's list; expected: mobile reflects the new status next time that screen is active (per the Assumptions section — background screens aren't required to update live, only on next foreground).

## Scenario 3 — Reconnect / offline catch-up (User Story 3, SC-003)

1. On a device with the dashboard open, disable network connectivity (airplane mode, or dev-tools network throttling set to "offline").
2. While disconnected, make a change to the same data from another connected session.
3. Re-enable connectivity on the first device.
4. **Expected**: within 10 seconds of reconnecting, the first device's data is fully caught up with no manual action (per the reconnect contract in `contracts/websocket-protocol.md`).
5. To validate the fallback-polling path (FR-005): block WebSocket upgrade specifically (e.g. via browser dev-tools blocking `wss://` or a firewall rule blocking the `/api/v1/ws` path) while leaving normal HTTPS open. **Expected**: the client falls back to refetching every 15 seconds instead of staying stale.

## Scenario 4 — Concurrent edit / in-progress form overwrite (FR-011, FR-006)

1. Open a record's edit form on device A and begin typing changes but do not save.
2. On device B, save a change to the same record.
3. **Expected on device A**: the incoming update is applied immediately, overwriting the unsaved in-progress form input (per the FR-011 clarification), accompanied by the FR-012 notification.

## Scenario 5 — Access control on the sync channel (FR-002)

1. Attempt to open a WebSocket connection to `/api/v1/ws` with an expired, malformed, or missing token (e.g. via `wscat -c "ws://localhost:8000/api/v1/ws?token=invalid"`).
2. **Expected**: the connection is closed immediately (WS close code `4401` per `contracts/websocket-protocol.md`) with no data leaked; check backend logs to confirm the attempt was recorded server-side per the clarified silent-reject-and-log behavior.
3. As a user scoped to Store A, confirm no events for Store B (same business, different store, if the user's role is store-scoped) are ever received — inspect the raw WS frames in browser dev-tools while another session mutates Store B's data.

## Success criteria checkpoints

Map back to `spec.md` Success Criteria:
- SC-001 → Scenarios 1–2 (5-second propagation)
- SC-002 → repeat Scenario 1/2 across every entity in `data-model.md`'s "Entity coverage" table
- SC-003 → Scenario 3
- SC-004 → load-test variant of Scenario 1/2 with ≥50 concurrent sessions against one business (separate load-test script, not manual)
- SC-005 → Scenario 4, repeated with rapid alternating edits to confirm convergence
- SC-006 → post-release qualitative tracking, not part of this quickstart
