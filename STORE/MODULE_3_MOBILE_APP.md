# MODULE 3 — React Native Worker Application

> **Context for the coding agent:** You are building the mobile app for **STORE**, used exclusively by `WORKER`-role employees at a single assigned store. The backend (Module 1) is already built. This app must work reliably on poor connectivity — **offline-first is a core requirement, not an enhancement**. Read `docs/openapi.json` for exact endpoint contracts; this document defines screens, navigation, offline sync strategy, and mobile-specific business logic.

---

## 0. Tech Stack

- React Native via **Expo** (managed workflow unless a specific native module forces a bare workflow later)
- TypeScript strict mode
- Navigation: `react-navigation` (native-stack + bottom-tabs)
- Server state: `@tanstack/react-query` (same as web, for consistency)
- Local persistence/offline queue: `expo-sqlite` or `WatermelonDB` — use **expo-sqlite** for v1 (simpler, sufficient for this scope); document WatermelonDB as a future upgrade if sync complexity grows
- Push notifications: `expo-notifications`
- Secure token storage: `expo-secure-store` (never AsyncStorage for tokens)
- Forms: `react-hook-form` + `zod` (mirrors web for consistency)

---

## 1. Scope Boundary (read this before building anything)

This app is for **WORKER role only**. A worker is always scoped to exactly one `assignedStore`. Every API call from this app must implicitly operate within that store context — never show a store picker, never let a worker query another store's data. If the backend ever returns data outside the assigned store, treat it as a bug to flag, not something to filter client-side silently.

Workers can: clock in/out, view today's inventory allocation, record sales, view recipes (read-only), view their target progress, submit tickets, manage their own profile/notifications. Workers cannot: manage other employees, edit recipes, manage stores, view analytics beyond their own performance, approve anything.

---

## 2. Folder Structure

```
mobile/
├── src/
│   ├── api/
│   │   ├── client.ts            # axios instance, same envelope unwrapping as web
│   │   └── endpoints/
│   ├── db/                       # expo-sqlite setup, offline queue table, sync logic
│   │   ├── schema.ts
│   │   ├── offlineQueue.ts
│   │   └── syncEngine.ts
│   ├── screens/                   # one folder per screen
│   ├── navigation/                  # stack/tab navigators
│   ├── components/
│   ├── hooks/
│   ├── context/                      # AuthContext, SyncStatusContext
│   ├── types/
│   └── lib/
├── app.json                          # Expo config
└── App.tsx
```

---

## 3. Navigation Structure

```
RootNavigator
├── (unauthenticated) AuthStack
│     Splash → Login
└── (authenticated) MainTabs (bottom tabs)
      Home
      Inventory
      Sales
      Attendance (could be a header action on Home instead of its own tab — decide based on usage frequency; default to its own tab since clock-in/out is high-frequency)
      Profile
    Modal/stack screens reachable from tabs:
      TodaysAllocation (from Inventory)
      RecipeViewer (from Home or Inventory)
      TargetProgress (from Home or Profile)
      TicketSubmission (from Profile or a floating action button)
      Notifications (from Home header bell icon)
      Settings (from Profile)
      CloseShop (from Home, MANAGER-assigned workers only if they have closing duty — otherwise omit per store config)
      OfflineQueue / SyncStatus (from Settings or a persistent banner)
```

---

## 4. Screen-by-Screen Specification

### 4.1 Splash
- Checks `expo-secure-store` for existing tokens on launch. If valid (or refreshable), skip to `Home`. Otherwise route to `Login`. Brief branded loading screen, no user interaction.

### 4.2 Login
- Email/password form. Calls `POST /auth/login`. On success, store access + refresh tokens in `expo-secure-store`, fetch and cache the user's profile (including `assignedStore`), register push token (`expo-notifications` → backend endpoint to associate device token with user).
- Handle offline gracefully: if no network, show a clear "no internet connection" state rather than a generic error — login cannot work offline by definition, but the error messaging should be honest about why.

### 4.3 Home
- Greeting + today's date + store name.
- Clock in/out quick action (mirrors Attendance screen's core action, surfaced here for speed).
- Today's target progress summary (mini version of Target Progress screen).
- Quick links: Today's Allocation, Record Sale, Submit Ticket.
- Notification bell with unread badge count.
- Pull-to-refresh re-fetches summary data; this screen should work from cached data when offline (show a subtle "offline — showing cached data" indicator, not a blocking error).

### 4.4 Inventory
- List of ingredients allocated to the worker's store, current quantity, low-stock indicator.
- Tap an ingredient → quick actions: record waste, request adjustment (creates a flagged record for MANAGER review — workers shouldn't silently edit stock; route through `POST /inventory/adjust` if their role permits it per backend RBAC, otherwise this submits a request/ticket instead).
- "Today's Allocation" button navigates to dedicated screen.

### 4.5 Today's Allocation
- Shows the day's `daily_assignments` for this store: ingredient, allocated quantity, returned quantity so far.
- "Return Stock" action at end of shift → `POST /inventory/return`, must work offline (queued, see Section 6).

### 4.6 Sales
- List of today's recorded sales for this store (most recent first).
- Floating "+ New Sale" button → sale entry flow: select food items (search/grid from the store's available menu, cached locally for offline use), quantity steppers, payment method selector, discount field (if permitted), submit.
- Sale submission **must work fully offline** — this is the single highest-priority offline use case. See Section 6.
- Receipt/confirmation screen after submission (shows "queued for sync" badge if offline).

### 4.7 Recipe Viewer
- Read-only list of recipes available to this store's menu, searchable.
- Recipe detail: ingredients, prep steps, serving size, images. No edit capability for workers.
- Must be available offline (cached on app open / periodic background refresh) since workers reference this during food prep, not just when connected.

### 4.8 Target Progress
- Worker's daily/weekly sales target vs actual, simple progress bar/chart (`recharts`-equivalent for RN — use `react-native-svg`-based chart lib, e.g. `victory-native`, or a simple custom progress bar component if a full charting lib is overkill for this single view).

### 4.9 Ticket Submission
- Form: title, description, priority, optional photo attachment (`expo-image-picker`).
- Calls `POST /tickets`. Must queue offline (lower priority than sales, but still queueable — see Section 6).
- "My Tickets" list view showing status of previously submitted tickets.

### 4.10 Profile
- View own info (name, email, assigned store, role).
- Edit limited fields (phone, photo).
- Change password.
- Links to Notifications, Settings.

### 4.11 Notifications
- List, mark-as-read on tap, pull-to-refresh.

### 4.12 Settings
- Push notification toggle, theme (light/dark/system), app version info, logout button.
- Link to Offline Queue / Sync Status screen.

### 4.13 Close Shop
- Only shown if this worker has closing duty for the store (check a flag — either `assignedStore` config or a role/permission flag from backend; if backend doesn't expose this yet, flag it back to Module 1 rather than guessing).
- End-of-day checklist: confirm all sales synced, confirm stock returns submitted, trigger `POST /sales/daily-close` and `POST /stores/:id/close`.
- **Block this action while offline** — closing the shop is a server-authoritative action that must not be queued; show a clear message requiring connectivity.

### 4.14 Offline Queue / Sync Status
- Lists pending queued actions (sales, returns, tickets) with status: `PENDING`, `SYNCING`, `FAILED`.
- Manual "Retry Sync" button.
- Failed items show the error and allow the worker to discard or retry individually.

---

## 5. Authentication Flow (mobile-specific notes)

- Tokens in `expo-secure-store`, never AsyncStorage.
- Background token refresh: attempt silent refresh on app foreground if access token is near expiry.
- On unrecoverable auth failure (refresh token invalid/expired), clear all tokens and route to Login — but **do not clear the offline queue**. Queued actions persist across logout/login so unsynced work isn't lost (they're tied to the device + original user, sync resumes once re-authenticated as the same user; if a different user logs in, surface a warning rather than silently dropping or submitting under the wrong identity).

---

## 6. Offline Strategy (core requirement — read carefully)

### 6.1 What must work offline
- Recording a sale
- Viewing today's allocation (from cache)
- Viewing recipes (from cache)
- Submitting a stock return
- Submitting a ticket
- Viewing own profile, target progress (from cache)

### 6.2 What must NOT work offline (require live connection)
- Login
- Close Shop (server-authoritative, must not be queued — risk of double-closing or inconsistent state)
- Password change

### 6.3 Offline Queue Design
- `expo-sqlite` table `offline_queue`:
  ```
  id, type (SALE | STOCK_RETURN | TICKET), payload (JSON), status (PENDING|SYNCING|SYNCED|FAILED),
  createdAt, lastAttemptAt, retryCount, errorMessage
  ```
- On any of the "must work offline" actions: write to SQLite immediately, update local cached state optimistically (so the UI reflects the action right away), and attempt an immediate sync if online.
- `syncEngine.ts`: runs on app foreground, on network reconnect (`@react-native-community/netinfo` listener), and on a periodic timer (e.g. every 60s while app is active). Processes `PENDING` items in creation order **per type** (sales should sync in order to keep inventory deduction sequencing sane on the backend).
- Use `POST /sales/batch` for syncing multiple queued sales in one request where possible, falling back to individual `POST /sales` calls if batch isn't suitable for the queued shape.
- Exponential backoff on repeated failures (cap retry count, surface as `FAILED` after e.g. 5 attempts, requiring manual retry from the Offline Queue screen).
- **Conflict handling:** if a queued sale references a food item that's been deleted/deactivated server-side by the time it syncs, mark it `FAILED` with a clear error rather than silently dropping it — a worker needs to know their recorded sale didn't go through.

### 6.4 Caching for read data
- Cache recipes, today's allocation, and menu/food items locally on fetch (React Query's cache plus a persisted layer via SQLite or `@tanstack/query-async-storage-persister` with `expo-secure-store`/`AsyncStorage` as the persister backend — use AsyncStorage here since this is non-sensitive cached data, not tokens).
- Show a persistent small banner/indicator when the app is operating offline, so workers always know their connectivity state.

---

## 7. Push Notifications

- Register Expo push token on login, send to backend (extend Module 1's user update endpoint or a dedicated `POST /users/me/push-token` — flag to Module 1 if this endpoint doesn't exist yet).
- Handle foreground notifications (show in-app banner) and background/killed-state notifications (deep link into the relevant screen — e.g. ticket update notification opens that ticket).

---

## 8. Image Uploads (recipe viewing images, ticket attachments)

- Use `expo-image-picker` for capturing/selecting images.
- Compress before upload (`expo-image-manipulator`) to keep mobile data usage reasonable.
- Ticket attachment uploads queue offline like other write actions if no connection (store local URI, upload binary on sync).

---

## 9. Barcode Scanning (future — stub only)

- Not required for v1. If time permits, add a stubbed screen/button ("Coming soon") in Inventory for barcode-based ingredient lookup, using `expo-camera`'s barcode scanning capability later. Do not block other screens on this.

---

## 10. Build Order

1. Expo project setup, navigation skeleton, AuthContext, SecureStore token handling.
2. Login + Splash, confirm auth flow against live backend.
3. SQLite schema + offline queue infrastructure (build this early — retrofitting offline support later is expensive).
4. Home screen (can stub some data initially).
5. Sales screen + sale recording flow, including offline queueing — this is the highest-value screen, prioritize correctness here.
6. Inventory + Today's Allocation screens.
7. Recipe Viewer (with caching).
8. Attendance (clock in/out) — wire into Home as well.
9. Target Progress.
10. Ticket Submission + My Tickets.
11. Profile, Notifications, Settings.
12. Offline Queue / Sync Status screen.
13. Close Shop (only after confirming with backend which role/flag gates this).
14. Push notification wiring end-to-end.

**Before moving to Module 4:** confirm offline sale recording survives an app kill mid-queue (force-close the app with pending queue items, relaunch, confirm sync resumes), confirm token refresh doesn't drop queued items, and flag any backend endpoints assumed in this document that don't actually exist yet (push token registration, worker closing-duty flag) back to Module 1 rather than building around their absence.
