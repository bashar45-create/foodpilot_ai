# Feature Specification: Real-Time Cross-App Data Sync

**Feature Branch**: `001-realtime-data-sync`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "when i change something in @STORE/mobile/ when i update database, in @STORE/frontend/ it didnt reflect, i need to refresh the page. so make a system that it automatically update data. read frontend backend and mobile section. make sure every data update is automatic. so first read the codebase and make plan"

## Clarifications

### Session 2026-07-14

- Q: FR-003 lists inventory, sales, recipes, attendance, tickets, and store settings as the "at minimum" scope for sync. Should v1 cover literally every data type/collection in the system, or is that explicit list the complete v1 scope? → A: Every data type/collection in the system must sync live in v1; the FR-003 list is a non-exhaustive set of examples/priority items, not a scope boundary.
- Q: When a live update arrives for a record the user currently has open in an edit form, what should happen? → A: Apply the update immediately, overwriting whatever the user was typing/editing in that form.
- Q: Should users see any visual indicator when a live update changes data on their screen? → A: Explicit toast/banner notification for every live update (e.g. "Record updated by another user").
- Q: What polling interval should the fallback mechanism (FR-005) use when a persistent live connection can't be maintained? → A: 15 seconds.
- Q: Should unauthorized live-update subscription attempts be silently dropped, or actively logged/flagged? → A: Silently drop from the client's perspective, but log the attempt server-side for security monitoring.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Worker updates data, dashboard reflects it instantly (Priority: P1)

A store worker using the mobile app clocks in, records a sale, or adjusts inventory. A manager or owner has the web dashboard open on a different device at the same time, viewing the same store's data. The dashboard updates automatically to show the new information without the manager needing to refresh the browser.

**Why this priority**: This is the exact pain point reported — mobile writes are invisible on the web dashboard until a manual refresh. It's the core problem the feature must solve, and it delivers value the moment any single data type (e.g. inventory) is made live.

**Independent Test**: With the dashboard open on one screen and the mobile app on another, perform an inventory adjustment on mobile and confirm the dashboard's inventory view updates within a few seconds with no manual refresh.

**Acceptance Scenarios**:

1. **Given** a manager has the inventory screen open on the web dashboard, **When** a worker on mobile allocates or returns stock for that store, **Then** the dashboard's inventory counts update automatically within a few seconds.
2. **Given** a manager has the sales/analytics screen open on the web dashboard, **When** a worker on mobile records a new sale, **Then** the dashboard's sales figures update automatically without a page refresh.
3. **Given** a manager has the attendance/staff screen open on the web dashboard, **When** a worker clocks in or out on mobile, **Then** the dashboard reflects the updated attendance status automatically.

---

### User Story 2 - Changes made on the web dashboard reflect everywhere else automatically (Priority: P2)

An owner or manager edits data directly on the web dashboard (e.g. updates a recipe, changes a price, edits store settings). Any other open dashboard session (another manager, another browser tab) and the mobile app reflect the change automatically, without anyone needing to refresh or restart the app.

**Why this priority**: The user's request explicitly says "every data update is automatic," not just mobile-to-web. Multi-tenant, multi-user businesses commonly have more than one person viewing the dashboard concurrently, so dashboard-to-dashboard sync closes the same gap from the other direction.

**Independent Test**: Open the web dashboard in two separate browser sessions (or two tabs), edit a record in one, and confirm the other updates automatically without a refresh.

**Acceptance Scenarios**:

1. **Given** two manager sessions are viewing the same store's recipe list, **When** one manager edits a recipe, **Then** the other session's recipe list updates automatically.
2. **Given** a mobile worker is viewing their assigned tickets, **When** a manager updates a ticket's status on the web dashboard, **Then** the mobile app reflects the new status automatically the next time that screen is active.

---

### User Story 3 - Sync degrades gracefully when connectivity is poor (Priority: P3)

A worker's mobile device loses network connectivity mid-shift, or a manager's browser tab sits in the background for a long time. When connectivity is restored, or the tab becomes active again, the data is automatically brought up to date without requiring a manual page reload.

**Why this priority**: Field conditions (spotty Wi-Fi, cellular dead zones in store backrooms) are already acknowledged in this codebase's offline-first mobile design. Live sync must not break or silently go stale under these realistic conditions, but this is a resilience concern layered on top of the core sync capability, not the primary value driver.

**Independent Test**: Disconnect a device's network, make a change elsewhere in the system, then restore the device's network connection and confirm the device's view updates automatically within a short time without a manual refresh.

**Acceptance Scenarios**:

1. **Given** a browser tab has lost its live connection to the server, **When** the connection is automatically re-established, **Then** the tab silently catches up to the latest data.
2. **Given** the mobile app was offline and other users changed shared data during that time, **When** the mobile app regains connectivity, **Then** its on-screen data refreshes automatically to match the current state.
3. **Given** a live connection cannot be established at all (e.g. restrictive network), **When** the user remains on a data screen, **Then** the system falls back to automatic refreshing every 15 seconds rather than staying silently stale indefinitely.

---

### Edge Cases

- What happens when two users edit the same record at nearly the same moment? The system must not corrupt data; the more recent confirmed write should be reflected to all viewers, consistent with existing conflict-handling behavior.
- What happens when a live update arrives for a record a user currently has open in an edit form? The update is applied immediately, including overwriting any unsaved in-progress input in that form — the live data always takes precedence over an unsaved local edit. The user is shown an explicit notification that this happened.
- What happens when a user is viewing a record that gets deleted elsewhere (e.g. a store, a recipe, an ingredient removed by another user)? The viewing screen must reflect the removal automatically rather than continuing to display or allow edits to a stale/deleted record.
- How does the system behave for a user who is not authorized to see a given store's data — do they receive live updates for stores outside their access? They must not; live updates must respect the same multi-tenant and role-based access boundaries as regular API requests. Any such unauthorized attempt is silently rejected client-side and logged server-side for security monitoring.
- What happens when a very large number of dashboard sessions are open at once for the same business (e.g. during a busy shift-change)? All sessions must still receive updates without materially degrading system responsiveness for anyone.
- What happens when a device is put to sleep or the app is backgrounded for an extended period? On return to the foreground, the app must bring its data up to date automatically rather than showing whatever was last on screen indefinitely.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST automatically propagate data changes (creates, updates, deletes) made through any client — mobile app or web dashboard — to all other actively connected clients that are viewing or subscribed to the affected data, without requiring a manual page refresh or app restart.
- **FR-002**: The system MUST scope automatic updates to the same multi-tenant and role-based access boundaries already enforced for regular data requests — a client must never receive live updates for a business, store, or record it is not authorized to view. Unauthorized subscription/update attempts MUST be silently rejected from the requesting client's perspective while being logged server-side for security monitoring.
- **FR-003**: The system MUST cover every tenant-scoped data type in the system for automatic sync, with no data type permanently exempted. Priority data types for initial delivery include inventory/stock levels, sales records, recipes, attendance/clock-in status, tickets, and store/business settings; all other data types must reach the same automatic-sync behavior as part of full feature completion.
- **FR-004**: The system MUST automatically recover and catch up a client's data after a temporary loss of connectivity, without requiring the user to manually refresh or reopen the screen.
- **FR-005**: The system MUST provide a fallback update mechanism (automatic periodic refresh at a 15-second interval) for clients/environments where a persistent live connection cannot be maintained, so that "automatic update" still holds even in degraded network conditions.
- **FR-006**: The system MUST NOT silently lose or overwrite a concurrent edit from another user's *saved* data; when two updates to the same record occur close together, all viewers must converge on the same final, consistent state. This does not extend to a user's own unsaved, in-progress form input — an incoming live update always overwrites unsaved local edits to the same record (see FR-011).
- **FR-007**: The mobile app's offline-queued actions (sales, inventory changes recorded while offline) MUST trigger the same automatic sync propagation to other clients once they are successfully synced to the server.
- **FR-008**: The system MUST reflect deletions and status changes (e.g. a store deactivated, a ticket closed) on all other active clients automatically, including removing or disabling views of records that no longer exist or are no longer accessible.
- **FR-009**: Automatic updates MUST NOT require the end user to take any action (no manual "refresh" button click, no pull-to-refresh, no app restart) to see current data while a screen showing shared data is open and active.
- **FR-010**: The system MUST apply automatic sync consistently across the web dashboard and the mobile app — this is not a web-only or mobile-only capability.
- **FR-011**: When a live update is received for a record the current user has open in an edit form, the system MUST apply the update immediately, replacing the on-screen data even if it overwrites the user's unsaved in-progress input.
- **FR-012**: The system MUST show the user an explicit, visible notification (e.g. a toast or banner) each time a live update changes data currently on their screen, so the user is never left unaware that displayed data changed out from under them.

### Key Entities

- **Data Change Event**: Represents a single create/update/delete occurring on any tenant-scoped record (inventory item, sale, recipe, attendance record, ticket, store setting, etc.). Carries enough information to identify which business/store it belongs to and which clients should be notified.
- **Client Subscription**: Represents an active client (a browser tab or mobile app session) currently viewing a set of data and expecting to be kept up to date, scoped to the user's business, store, and role-based access.
- **Sync State**: Represents whether a given client is currently receiving live updates, is in a temporarily disconnected/catching-up state, or has fallen back to periodic polling.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A change made on one device (mobile or web) is visible on another actively-open device viewing the same data within 5 seconds, without any manual refresh.
- **SC-002**: 100% of tenant-scoped data types in the system support automatic sync — none require a manual refresh to see changes made elsewhere. The priority data types (inventory, sales, recipes, attendance, tickets, store settings) are validated first, with full-system coverage required for feature completion.
- **SC-003**: After a device regains connectivity following an outage of up to 10 minutes, its displayed data is fully caught up within 10 seconds of reconnecting, with no manual action required.
- **SC-004**: In a simulated busy-period test with at least 50 concurrent active sessions for one business, all sessions still receive updates within the 5-second target with no dropped updates.
- **SC-005**: Zero data-loss incidents occur where a concurrent edit from one user is silently discarded without any viewer ever seeing the resulting state — all viewers converge on one consistent final value.
- **SC-006**: Users self-report (via support tickets or feedback) that they no longer need to manually refresh the dashboard to see mobile-originated changes — a 90%+ reduction in "data looks stale" reports compared to the pre-feature baseline.

## Assumptions

- Users on both mobile and web are assumed to have at least intermittent internet connectivity; fully offline businesses are out of scope (mobile's existing offline queue already handles temporary disconnection and is preserved by this feature).
- "Automatically update" means updates are pushed to or promptly pulled by clients while a relevant screen is open and active; it does not require updating screens that are not currently visible/foregrounded, though data must still be current the next time that screen is shown.
- The existing REST API contract (`/api/v1/...`) remains the source of truth for reads and writes; this feature adds a notification/propagation layer on top rather than replacing existing data-fetching logic.
- The 5-second propagation target (SC-001) is a reasonable default for a business-operations tool (not a high-frequency trading or gaming context) and was not specified by the user.
- Existing authentication and multi-tenant scoping mechanisms will be reused to authorize live update delivery; no new access-control model is introduced.
- Conflict resolution follows a "last confirmed write wins, all clients converge" model consistent with typical CRUD systems, since the user did not specify custom conflict-resolution rules.
