# MODULE 2 — React Web Dashboard

> **Context for the coding agent:** You are building the web dashboard for **STORE**, a multi-tenant ERP. The backend (Module 1) is already built and exposes a REST API at `/api/v1/...` under the standard response envelope described below. **Read `docs/openapi.json` (exported by the backend) before starting, and treat it as ground truth over this document if they ever conflict on field names or routes.** This document defines page structure, components, state management conventions, and how every page maps to backend endpoints.

---

## 0. Tech Stack

- React (Vite, not CRA)
- TypeScript (strict mode on — backend is fully typed via Pydantic, frontend should match)
- React Query (`@tanstack/react-query`) for all server state — never use `useEffect` + `fetch` + `useState` for API data
- React Router for navigation
- A component library: shadcn/ui + Tailwind CSS (consistent with the rest of the project's tooling). Use Tailwind utility classes; avoid hand-rolled CSS files unless necessary.
- Form handling: `react-hook-form` + `zod` for schema validation, mirroring backend Pydantic validation rules
- Charts: `recharts`
- State for non-server UI state (sidebar open/closed, theme, etc): React Context or `zustand` — keep it minimal, don't reach for Redux

---

## 1. API Integration Conventions

### 1.1 Response envelope (matches backend exactly)
```ts
interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta?: { page: number; limit: number; total: number };
}
interface ApiError {
  success: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
}
```
Build a single `apiClient` (axios instance) with a response interceptor that unwraps `data` on success and throws a typed `ApiException` on `success: false`, so React Query hooks just get clean data or a typed error to handle.

### 1.2 Auth handling
- Store access token in memory (React Query / context), **not** localStorage, to reduce XSS exposure. Store refresh token in an httpOnly cookie if the backend supports setting one; otherwise document this as a known v1 limitation.
- Axios interceptor: on `401`, attempt silent refresh via `/api/v1/auth/refresh-token` once; if that fails, force logout and redirect to `/login`.
- Wrap the whole app in an `AuthProvider` exposing `{ user, business, role, login, logout, isLoading }`.

### 1.3 React Query conventions
- One query key factory per domain, e.g. `inventoryKeys.list(filters)`, `inventoryKeys.detail(id)`. Keep these centralized in `src/api/queryKeys.ts` so cache invalidation is consistent.
- Every mutation invalidates the relevant list query keys on success.
- Default `staleTime` of 30s for frequently-changing data (sales, inventory), 5min for slow-changing data (settings, store config).
- Every list-fetching hook exposes loading, error, and empty states — pages must render all three, not just the happy path.

---

## 2. Folder Structure

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts
│   │   ├── queryKeys.ts
│   │   └── endpoints/          # one file per module, thin wrapper functions calling apiClient
│   ├── components/
│   │   ├── ui/                 # shadcn primitives
│   │   ├── layout/              # Sidebar, Topbar, AppShell
│   │   └── shared/               # DataTable, Pagination, EmptyState, ConfirmDialog, etc.
│   ├── features/                 # one folder per domain module (mirrors backend modules)
│   │   ├── auth/
│   │   ├── stores/
│   │   ├── inventory/
│   │   ├── recipes/
│   │   ├── food/
│   │   ├── employees/
│   │   ├── sales/
│   │   ├── tickets/
│   │   ├── notifications/
│   │   ├── analytics/
│   │   └── ai-assistant/
│   ├── hooks/
│   ├── pages/                    # route-level components, compose feature components
│   ├── routes/                   # React Router config + route guards
│   ├── types/                     # shared TS types mirroring backend schemas
│   ├── context/
│   └── lib/
```

Each `features/<domain>/` folder contains: `components/`, `hooks/` (React Query hooks for that domain), `types.ts`.

---

## 3. Route Guards & Permissions

- `<ProtectedRoute>` wrapper — redirects to `/login` if unauthenticated.
- `<RoleGuard roles={["OWNER","MANAGER"]}>` wrapper — renders `403` page content if role doesn't match. Mirror backend role checks; never rely on frontend gating alone for security, but it must match backend behavior so users don't see broken UI for actions they can't perform.
- Worker role gets a reduced sidebar — see section 5.

---

## 4. Page-by-Page Specification

> For every page: purpose, key components, connected backend endpoint(s), state/loading/error handling, and permissions. Build pages in the order listed in Section 7 (Build Order) to avoid building UI for endpoints that don't exist yet.

### 4.1 Auth Pages
- **Login** (`/login`) — email/password form (`react-hook-form` + `zod`), calls `POST /auth/login`, on success stores tokens via AuthProvider and redirects to `/dashboard`. Show inline validation errors and a toast for `401` (invalid credentials).
- **Register** (`/register`) — business name + owner name/email/password. Calls `POST /auth/register`.
- **Forgot Password** (`/forgot-password`) — email input, calls `POST /auth/forgot-password`, shows generic "check your email" message regardless of whether the email exists (don't leak account existence).
- **Reset Password** (`/reset-password?token=`) — new password form, calls `POST /auth/reset-password`.

### 4.2 Dashboard (`/dashboard`)
- Overview cards: today's revenue (all stores), low-stock alert count, open tickets count, active stores.
- Revenue trend chart (last 7/30 days, `recharts` line chart) — sourced from `GET /analytics/revenue`.
- Recent sales table (last 10).
- Recent tickets needing attention.
- Quick links to AI Assistant.
- All cards independently loading/erroring — use `Suspense` boundaries or per-card loading skeletons so one slow query doesn't block the whole dashboard.

### 4.3 Business Profile (`/settings/business`)
- View/edit business name, industry. OWNER only for edits.
- Linked: currency, timezone, language, tax rate (from `settings` collection) — `GET/PUT /settings`.

### 4.4 Stores
- **Stores list** (`/stores`) — `DataTable` of stores with status badge (OPEN/CLOSED/INACTIVE), search, filter by status. `GET /stores`. "Add Store" button (OWNER only) opens a dialog form, `POST /stores`.
- **Store Details** (`/stores/:id`) — tabs: Overview (config form, `PUT /stores/:id`), Analytics (`GET /stores/:id/analytics` — charts), Performance (`GET /stores/:id/performance`), Daily Reports (`GET /stores/:id/daily-report` with a date picker), Open/Close actions (buttons calling `POST /stores/:id/open` / `/close`).

### 4.5 Employees
- **Employees list** (`/employees`) — table with role, assigned store, status. `GET /users` filtered to non-owner roles, or a dedicated employees view if `/users` doubles as this.
- **Employee Details** (`/employees/:id`) — profile, attendance history (`GET /attendance/:userId/history`), performance (`GET /employees/:id/performance`), daily target editor (`PUT /employees/:id/daily-target`), assign-store control.

### 4.6 Inventory
- **Inventory list** (`/inventory`) — `DataTable` of ingredients with current stock, min/max, low-stock highlighting, category filter, search. `GET /inventory/ingredients`. Actions: Purchase, Adjust, Transfer (dialogs triggering respective POST endpoints).
- **Ingredient Details** (`/inventory/:id`) — metadata edit form, stock history table (`GET /inventory/history/:id`) with action-type filter and date range, cost trend chart.
- **Suppliers** (`/inventory/suppliers`) — CRUD table, supplier detail shows purchase history (`GET /inventory/suppliers/:id/purchase-history`).
- Low stock banner/widget reused across Inventory and Dashboard pages — build as a shared component.

### 4.7 Recipes
- **Recipes list** (`/recipes`) — grid or table view, status badge (DRAFT/APPROVED), search.
- **Recipe Editor** (`/recipes/:id/edit` and `/recipes/new`) — dynamic ingredient list builder (add/remove rows: ingredient select, quantity, unit, optional checkbox, notes), preparation steps (sortable list), serving size, image upload, live cost preview (calls `GET /recipes/:id/cost` debounced as ingredients change, or computes client-side estimate before save). "Draft with AI" button opens a prompt input that calls `POST /recipes/draft-ai` and pre-fills the form with the returned draft for the user to review/edit before saving.
- **Recipe Viewer** (`/recipes/:id`) — read-only view, version history list, "Approve" button (MANAGER/OWNER) calling `PATCH /recipes/:id/approve`, "Duplicate" button.

### 4.8 Food Menu
- **Food Menu** (`/menu`) — table/grid of food items, price, cost, estimated profit, availability toggle per store, category filter.
- **Categories** (`/menu/categories`) — simple CRUD list.
- Food item create/edit dialog: select recipe (auto-fills cost), set price, assign to stores (multi-select), upload image, set availability.

### 4.9 Assignments
- **Assignments** (`/assignments`) — view daily ingredient allocations to stores, create new allocation (`POST /inventory/allocate`), record returns (`POST /inventory/return`). Table grouped by store and date.

### 4.10 Attendance
- **Attendance** (`/attendance`) — table filtered by date/store/employee, manual clock-in/out override (MANAGER/OWNER), leave request approval queue.

### 4.11 Sales
- **Sales** (`/sales`) — transaction table, filters (date range, store, payment method), refund action opening a confirm dialog (`POST /sales/:id/refund`), "Daily Close" button per store.

### 4.12 Reports (`/reports`)
- Generated daily/period reports, export buttons (CSV/PDF) calling `GET /analytics/export`.

### 4.13 Analytics (`/analytics`)
- Tabbed dashboard: Revenue, Profit, Inventory, Employees, Stores, Food — each tab fetches its respective `GET /analytics/...` endpoint and renders charts (`recharts`) plus a KPI summary row. Date range picker shared across tabs via URL query params (so links are shareable/bookmarkable).

### 4.14 Tickets
- **Tickets list** (`/tickets`) — Kanban-style by status or a filterable table, priority badges, assignee avatars.
- **Ticket Details** (`/tickets/:id`) — comment thread, status/priority/assignee editors, attachment upload.

### 4.15 Notifications
- **Notifications** (`/notifications`) — list with unread highlighting, mark-all-read button. Also surfaced as a bell icon dropdown in the Topbar showing unread count (poll `GET /notifications` every 30s or use a lightweight websocket if backend adds one later — for v1, polling is fine).

### 4.16 AI Assistant (`/ai-assistant`)
> Backend contract for this page is finalized in Module 4 — build the UI shell now, wire it once Module 4's `ai.py` endpoints are live.
- Left sidebar: list of past conversations (`ai_conversations`), "New Chat" button.
- Main panel: chat thread (`ai_messages` for selected conversation), message input at bottom.
- Row of quick-prompt buttons above input (e.g. "Today's sales?", "What should I stock tomorrow?") that populate and send the input.
- Streaming response rendering if the backend supports SSE/streaming; otherwise render full response on completion with a loading indicator.

### 4.17 Settings (`/settings`)
- Sub-pages: Business Profile (4.3), Notification Preferences, AI Settings (toggle AI assistant features, model preferences if exposed), Theme (light/dark), Tax Rate, Working Hours.

### 4.18 Audit Logs (`/settings/audit-logs`)
- OWNER only. Table of `audit_logs`, filterable by module/user/date, read-only.

### 4.19 Profile & Change Password (`/profile`)
- Current user's own profile edit, change password form (`POST /auth/change-password`).

### 4.20 Utility Pages
- `/help`, `/support` — static content for v1, can be simple markdown-rendered pages.
- `404` — not found page with a link back to dashboard.
- `403` — forbidden page (used by `RoleGuard`).
- `/maintenance` — static page for planned downtime, not routed to automatically unless a feature flag/env var triggers it.

---

## 5. Sidebar Navigation Structure (role-aware)

```
OWNER / MANAGER sidebar:
  Dashboard
  Stores
  Employees
  Inventory
    - Ingredients
    - Suppliers
  Recipes
  Food Menu
  Assignments
  Attendance
  Sales
  Reports
  Analytics
  Tickets
  AI Assistant
  Notifications (icon, top bar)
  Settings
    - Business Profile
    - Audit Logs (OWNER only)
    - Notification Preferences
    - AI Settings

WORKER sidebar (reduced):
  Home (their assigned store's mini-dashboard)
  Inventory (read + allocation actions only)
  Sales (record sales)
  Recipes (view only)
  Attendance (clock in/out, own history)
  Tickets (raise + view own)
  Notifications
  Profile
```

---

## 6. Shared Components to Build First

Build these before any page, since every page depends on them:
1. `<AppShell>` — sidebar + topbar + content outlet layout.
2. `<DataTable>` — generic table with sorting, pagination (server-driven, using `meta` from response envelope), column-based filters, loading skeleton rows, empty state.
3. `<ConfirmDialog>` — for destructive/important actions (refunds, deactivation, deletes).
4. `<FormDialog>` — modal wrapper around `react-hook-form` forms, used across create/edit flows.
5. `<StatusBadge>` — consistent color-coded badges for OPEN/CLOSED, DRAFT/APPROVED, ticket priorities, etc.
6. `<EmptyState>` — consistent "no data" illustration/message across all list pages.
7. `<KpiCard>` — used on Dashboard and Analytics.
8. `<DateRangePicker>` — shared across Analytics, Reports, Sales filters.

---

## 7. Build Order

1. `apiClient`, `AuthProvider`, route guards, AppShell, shared components (Section 6).
2. Auth pages (Login, Register, Forgot/Reset Password) — confirms backend integration works end to end.
3. Dashboard (basic version, can stub charts until Analytics endpoints are confirmed working).
4. Stores module pages.
5. Employees module pages.
6. Inventory module pages (largest module — budget the most time here).
7. Recipes + Food Menu pages (depend on Inventory ingredient selects).
8. Assignments, Attendance pages.
9. Sales pages (depend on Food Menu + Inventory).
10. Reports + Analytics pages.
11. Tickets + Notifications pages.
12. Settings, Audit Logs, Profile pages.
13. AI Assistant UI shell (functional wiring happens after Module 4 backend lands).
14. 404/403/Maintenance utility pages — quick, do these anytime, but don't skip them before considering Module 2 "done."

**Before moving to Module 3:** confirm every page handles loading/error/empty states (not just happy path), confirm RoleGuard behavior matches backend role checks for at least one OWNER-only and one WORKER-restricted route, and note any backend field names that didn't match `docs/openapi.json` so Module 1 can be patched rather than the frontend silently working around a mismatch.
