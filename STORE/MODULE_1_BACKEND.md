# MODULE 1 — Backend & Database (FastAPI + MongoDB)

> **Context for the coding agent:** You are building the backend for **STORE**, a multi-tenant Smart Multi-Store ERP Platform. This document is the single source of truth for the backend. Modules 2 (React Web Dashboard), 3 (React Native Worker App), and 4 (AI Integration) will all consume the API contracts defined here. **Do not rename fields, endpoints, or collections defined in this document** — later modules assume these exact names. If you must deviate, stop and flag it instead of silently changing something.

---

## 0. Project Identity

- **Project name:** STORE
- **Type:** Multi-tenant SaaS ERP for businesses running multiple food/retail stores
- **Tenancy model:** Single MongoDB database, shared collections, every document scoped by `businessId`. Never write a query that omits `businessId` filtering (except super-admin tooling).
- **Database name:** `store_erp`
- **Repo root:** `STORE/` (already created) with `backend/`, `frontend/`, `mobile/`, `docs/`, `deployment/`, `scripts/`

---

## 1. Tech Stack (locked — do not substitute)

| Layer | Choice |
|---|---|
| Language | Python 3.13 |
| Framework | FastAPI |
| DB Driver | `motor` (async PyMongo) — use Motor, not sync PyMongo, since FastAPI is async |
| Validation | Pydantic v2 |
| Auth | JWT (access + refresh tokens) |
| Database | MongoDB Atlas |
| Caching | Redis |
| Background jobs | Celery or APScheduler (APScheduler is simpler — use it unless task volume demands Celery) |
| Containerization | Docker / docker-compose |

If asked to pick a Mongo driver, **always use `motor`**, not `pymongo` synchronously and not `mongoengine`. Pydantic v2 models do not map 1:1 to Mongo documents — write explicit `to_mongo()` / `from_mongo()` or use a thin ODM layer (e.g. `beanie` is acceptable as an alternative to raw motor if it speeds up development, but stay consistent once chosen — don't mix raw motor and beanie across modules).

---

## 2. Backend Folder Structure (already decided — generate exactly this)

```
backend/
├── app/
│   ├── api/                # one router file per feature
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── stores.py
│   │   ├── inventory.py
│   │   ├── recipes.py
│   │   ├── food.py
│   │   ├── sales.py
│   │   ├── attendance.py
│   │   ├── tickets.py
│   │   ├── reports.py
│   │   ├── analytics.py
│   │   ├── notifications.py
│   │   └── ai.py
│   ├── core/                # config, security, constants
│   ├── database/            # mongo client, connection lifecycle
│   ├── models/               # MongoDB document models (one file per collection)
│   │   ├── business.py
│   │   ├── user.py
│   │   ├── store.py
│   │   ├── ingredient.py
│   │   ├── supplier.py
│   │   ├── recipe.py
│   │   ├── food.py
│   │   ├── sale.py
│   │   ├── attendance.py
│   │   ├── assignment.py
│   │   ├── ticket.py
│   │   ├── notification.py
│   │   ├── inventory_log.py
│   │   └── ai_chat.py
│   ├── schemas/               # request/response Pydantic models only
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── store.py
│   │   ├── recipe.py
│   │   ├── ingredient.py
│   │   ├── food.py
│   │   ├── sale.py
│   │   └── ticket.py
│   ├── services/              # business logic, no DB calls directly to driver — call repositories
│   │   ├── inventory_service.py
│   │   ├── sales_service.py
│   │   ├── recipe_service.py
│   │   ├── notification_service.py
│   │   ├── analytics_service.py
│   │   ├── attendance_service.py
│   │   ├── assignment_service.py
│   │   └── ai_service.py
│   ├── repositories/          # database access layer only — no business logic
│   │   ├── inventory_repository.py
│   │   ├── user_repository.py
│   │   ├── sales_repository.py
│   │   └── store_repository.py
│   ├── middleware/            # auth middleware, businessId injection, logging, error handling
│   ├── dependencies/          # FastAPI Depends() — current_user, current_business, RBAC guards
│   ├── utils/
│   ├── ai/                    # placeholder, built out in Module 4
│   ├── workers/               # APScheduler jobs / Celery tasks
│   ├── logs/
│   ├── config.py
│   └── main.py
├── tests/
├── requirements.txt
├── .env
└── Dockerfile
```

**Layering rule (enforce strictly):**
`api/` (routers) → `services/` (business logic) → `repositories/` (DB access) → `database/` (raw motor client)

A router must never call a repository directly. A service must never construct a raw Mongo query directly — that belongs in the repository. This separation is what lets Module 4's AI layer call services safely without duplicating business rules.

---

## 3. Core Architectural Rules

1. **Multi-tenancy enforcement.** Every document in every collection (except `audit_logs` of platform-level actions) has a `businessId: ObjectId` field. Every repository method that lists/finds/updates/deletes must accept and apply `businessId` as a mandatory filter — never optional. Write a custom lint/test that fails CI if a Mongo query in `repositories/` lacks `businessId` in its filter dict (except for collections that are intentionally global, like `users` during login lookup by email before the JWT exists).
2. **Repository pattern.** All Mongo access goes through `repositories/*.py`. Never call `db.collection.find(...)` from a service or router.
3. **Dependency injection.** Use FastAPI `Depends()` for: DB session/client, current authenticated user, current business context, and RBAC permission checks. Define these in `dependencies/`.
4. **Immutable ledger for inventory.** Never decrement/increment `ingredients.currentStock` directly without writing a corresponding `inventory_logs` entry. `currentStock` is a cached/derived value; `inventory_logs` is the source of truth.
5. **Soft deletes where it matters.** Stores, users, ingredients, recipes use `isActive: bool` rather than hard delete. Sales, inventory_logs, audit_logs are never deleted or mutated after creation.
6. **API versioning.** All routes are prefixed `/api/v1/...`. Build this in from day one via an `APIRouter(prefix="/api/v1")` mounted in `main.py`.
7. **Consistent response envelope.** Every endpoint returns:
   ```json
   {
     "success": true,
     "data": { ... } ,
     "message": "Optional human-readable message",
     "meta": { "page": 1, "limit": 20, "total": 134 }
   }
   ```
   `meta` is only present on paginated list endpoints. Errors use:
   ```json
   {
     "success": false,
     "error": {
       "code": "INVENTORY_INSUFFICIENT_STOCK",
       "message": "Not enough stock to complete this allocation",
       "details": { "ingredientId": "...", "available": 2.5, "requested": 5 }
     }
   }
   ```
   Define a custom `AppException` hierarchy in `core/` and a global exception handler in `main.py` that converts all exceptions to this envelope. Module 2 and 3 will assume this exact shape.

---

## 4. Authentication & Authorization

### 4.1 JWT Strategy
- **Access token:** short-lived (15 min), contains `sub` (userId), `businessId`, `role`, `assignedStore` (if worker).
- **Refresh token:** long-lived (7–30 days), stored hashed in `users.refreshToken`, rotated on every use (issue a new refresh token each time, invalidate the old).
- Use `python-jose` or `pyjwt` for signing (HS256 is fine for v1; document that RS256 is a future upgrade for multi-service scaling).

### 4.2 Roles (RBAC)
```
OWNER        - full access to their business
MANAGER      - manage assigned store(s), cannot manage billing/business settings
WORKER       - operate within their assigned store only, limited write access
SUPER_ADMIN  - future, platform-level, cross-business access
```
Define permission guards as FastAPI dependencies, e.g. `require_role(["OWNER", "MANAGER"])`, and a more granular `require_permission("inventory:write")` if you want resource-level permissions later. For v1, role-based gating at the route level is sufficient — don't over-engineer a full permission matrix yet, but write the dependency so it's swappable later.

### 4.3 Endpoints — Auth Module

For **every** endpoint below, the agent must implement: purpose, request validation (Pydantic schema), business logic, DB interaction, response codes, and required role (if any).

| Method | Path | Purpose | Auth required |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Register a new business + first OWNER user | No |
| POST | `/api/v1/auth/login` | Email + password login, returns access + refresh token | No |
| POST | `/api/v1/auth/logout` | Invalidate refresh token | Yes |
| POST | `/api/v1/auth/refresh-token` | Exchange refresh token for new access token (rotates refresh token) | No (refresh token in body/cookie) |
| POST | `/api/v1/auth/forgot-password` | Send password reset email/token | No |
| POST | `/api/v1/auth/reset-password` | Reset password using token from forgot-password | No |
| POST | `/api/v1/auth/verify-email` | Verify email via token | No |
| POST | `/api/v1/auth/change-password` | Change password while logged in | Yes |

**Register flow detail:** registering creates a `businesses` document AND a `users` document (role `OWNER`) in a single transaction (use a Mongo session/transaction since this spans two collections). On success, also auto-create a default `settings` document for the business.

**Validation rules:** email format, password min length 8 with at least one number, businessName non-empty. Return `409 Conflict` with code `EMAIL_ALREADY_EXISTS` if duplicate.

**Response codes convention (apply across the whole API):**
- `200` success (GET, PUT, PATCH actions that don't create)
- `201` created (POST that creates a resource)
- `204` no content (DELETE)
- `400` validation error
- `401` unauthenticated
- `403` authenticated but forbidden (role/permission)
- `404` not found
- `409` conflict (duplicate, business rule conflict)
- `422` Pydantic validation failure (FastAPI default — keep it, don't override to 400)
- `500` unhandled server error (logged, generic message returned)

---

## 5. Module-by-Module Endpoint & Logic Spec

> For each module below, build every endpoint with: input schema (Pydantic), output schema, validation, permission requirement, business logic summary, and which repository/service it touches. Keep services thin wrappers around repositories plus the business rules explicitly called out.

### 5.1 User Module
- `GET /api/v1/users` — list users in business (filter by role, store, isActive). OWNER/MANAGER only.
- `GET /api/v1/users/{id}` — get single user.
- `POST /api/v1/users` — create worker/manager (OWNER/MANAGER only). Sends invite email with temp password or magic link.
- `PUT /api/v1/users/{id}` — update profile fields.
- `PATCH /api/v1/users/{id}/status` — activate/deactivate.
- `PATCH /api/v1/users/{id}/assign-store` — assign worker to a store.
- `POST /api/v1/users/{id}/reset-password` — OWNER/MANAGER triggers reset for a user.
- Every mutating action here writes an `audit_logs` entry (`module: "users"`).

### 5.2 Store Module
- `GET /api/v1/stores` — list stores for business.
- `GET /api/v1/stores/{id}` — store detail.
- `POST /api/v1/stores` — create store (OWNER only).
- `PUT /api/v1/stores/{id}` — update store config (hours, location, etc).
- `PATCH /api/v1/stores/{id}/status` — open/close/activate/deactivate.
- `GET /api/v1/stores/{id}/analytics` — revenue, sales count, top items for date range.
- `GET /api/v1/stores/{id}/performance` — comparison metrics vs other stores in business.
- `POST /api/v1/stores/{id}/open` — daily open action, timestamps an "opening" event.
- `POST /api/v1/stores/{id}/close` — daily close action; this should trigger `sales_service.generate_daily_report(storeId, date)`.
- `GET /api/v1/stores/{id}/daily-report?date=` — fetch a generated daily report.

### 5.3 Inventory Module (this is the most complex module — implement carefully)
Core principle restated: **inventory_logs is the immutable ledger. `ingredients.currentStock` is a cache.**

- `GET /api/v1/inventory/ingredients` — list ingredients (filter by store, category, low-stock flag).
- `POST /api/v1/inventory/ingredients` — create ingredient.
- `PUT /api/v1/inventory/ingredients/{id}` — update ingredient metadata (not stock — stock changes only via logged actions below).
- `POST /api/v1/inventory/purchase` — record a purchase. Body: `ingredientId, quantity, unit, purchasePrice, supplierId`. Effect: write `inventory_logs` (action `PURCHASE`), update `currentStock` and recompute `averageCost` (weighted average), create a `purchase_orders` record.
- `POST /api/v1/inventory/adjust` — manual adjustment (action `ADJUSTMENT`), requires `reason` field, requires MANAGER+ role.
- `POST /api/v1/inventory/transfer` — move stock between stores (action `TRANSFER`, writes two log entries — one negative at source, one positive at destination — both referencing each other via `referenceId`).
- `POST /api/v1/inventory/allocate` — daily allocation of ingredients to a store for the day (action `ALLOCATION`).
- `POST /api/v1/inventory/return` — return unused allocated stock (action `RETURN`).
- `GET /api/v1/inventory/history/{ingredientId}` — paginated `inventory_logs` for one ingredient.
- `GET /api/v1/inventory/low-stock` — ingredients where `currentStock <= minimumStock`.
- `GET /api/v1/inventory/variance-report?storeId=&date=` — compares expected stock (from logs) vs actual physical count if a count was submitted; flags discrepancies.
- Suppliers: `GET/POST/PUT /api/v1/inventory/suppliers`, `GET /api/v1/inventory/suppliers/{id}/purchase-history`.
- `GET /api/v1/inventory/valuation` — total inventory value = Σ(currentStock × averageCost) per store/business.

**Automatic deduction:** when a sale is recorded (Sales Module), `sales_service` must call `inventory_service.deduct_for_sale(foodItemId, quantitySold, storeId)`, which looks up the recipe's ingredients, multiplies by quantity sold, and writes `inventory_logs` entries with action `SALE` for each ingredient consumed, decrementing `currentStock`. If insufficient stock, raise an `AppException` with code `INVENTORY_INSUFFICIENT_STOCK` — decide with the business owner (configurable in `settings.aiSettings` or a new flag) whether sales are blocked or allowed to go negative; default to **blocking**.

### 5.4 Recipe Module
- `GET /api/v1/recipes`, `GET /api/v1/recipes/{id}`
- `POST /api/v1/recipes` — create recipe with ingredients array `[{ingredientId, quantity, unit, optional, notes}]`, preparation steps, serving size.
- `PUT /api/v1/recipes/{id}` — update; **on update, create a new entry in a `versions` array inside the recipe document** rather than overwriting (keep last N versions or all — start with all, optimize later).
- `POST /api/v1/recipes/{id}/duplicate` — clone a recipe.
- `POST /api/v1/recipes/{id}/images` — upload recipe image(s) to file storage, store URL.
- `GET /api/v1/recipes/{id}/cost` — computed cost = Σ(ingredient.averageCost × quantity), recalculated on demand or cached and invalidated when ingredient prices change.
- `POST /api/v1/recipes/draft-ai` — calls Module 4's AI service to draft a recipe from a text prompt (returns a draft, not yet saved).
- `PATCH /api/v1/recipes/{id}/approve` — MANAGER/OWNER approves a draft recipe for use in menus.

### 5.5 Food Menu Module
- `GET /api/v1/food`, `GET /api/v1/food/{id}`
- `POST /api/v1/food` — create food item linked to `recipeId`, set `price`. `cost` is read from recipe cost at creation time and cached; `estimatedProfit = price - cost`.
- `PUT /api/v1/food/{id}` — update price/availability/assignedStores.
- `PATCH /api/v1/food/{id}/availability` — toggle per-store availability.
- `GET /api/v1/food/categories`, `POST /api/v1/food/categories`
- `POST /api/v1/food/{id}/recalculate-cost` — manually trigger recompute (also auto-triggered via a background worker when ingredient `purchasePrice`/`averageCost` changes significantly — see Workers section).

### 5.6 Employee Module
- `POST /api/v1/attendance/clock-in`, `POST /api/v1/attendance/clock-out`
- `GET /api/v1/attendance?userId=&storeId=&date=`
- `GET /api/v1/attendance/{userId}/history`
- `POST /api/v1/attendance/leave-request`, `PATCH /api/v1/attendance/leave-request/{id}/approve`
- `GET /api/v1/employees/{id}/performance` — sales attributed to `createdBy`, productivity vs target.
- `GET /api/v1/employees/{id}/daily-target`, `PUT /api/v1/employees/{id}/daily-target`
- `PATCH /api/v1/employees/{id}/assign-store`

### 5.7 Sales Module
- `POST /api/v1/sales` — record a sale. Body includes `storeId, items[{foodItemId, quantity, unitPrice}], paymentMethod, discount, tax, device`. Service computes `netRevenue` and `grossProfit`, sets `createdBy` from auth context, triggers inventory deduction (5.3).
- `POST /api/v1/sales/batch` — bulk upload (for offline mobile sync — see Module 3).
- `GET /api/v1/sales?storeId=&from=&to=&paymentMethod=`
- `GET /api/v1/sales/{id}`
- `POST /api/v1/sales/{id}/refund` — creates a negative-adjustment record, does NOT delete original sale, reverses inventory deduction.
- `POST /api/v1/sales/daily-close` — close out a store's day: locks further sales edits for that date, generates summary, feeds Store Module's daily report.
- `GET /api/v1/sales/analytics?groupBy=day|week|month&storeId=`

### 5.8 Ticket Module
- `GET /api/v1/tickets`, `POST /api/v1/tickets`, `GET /api/v1/tickets/{id}`, `PUT /api/v1/tickets/{id}`
- `POST /api/v1/tickets/{id}/comments`
- `PATCH /api/v1/tickets/{id}/status`, `PATCH /api/v1/tickets/{id}/assign`
- `POST /api/v1/tickets/{id}/attachments`
- Status enum: `OPEN, IN_PROGRESS, RESOLVED, CLOSED`. Priority enum: `LOW, MEDIUM, HIGH, URGENT`.
- Status/assignment changes trigger Notification Module.

### 5.9 Notification Module
- `GET /api/v1/notifications` — list for current user, paginated, unread-first.
- `PATCH /api/v1/notifications/{id}/read`, `PATCH /api/v1/notifications/mark-all-read`
- Internal service `notification_service.send(userId, type, payload)` used by other services (ticket assignment, low stock alerts, leave approval, etc.) — push via FCM/APNs token stored on user, email via background worker. SMS is a stubbed-out future channel — define the interface but no-op the implementation.

### 5.10 Analytics Module
- `GET /api/v1/analytics/revenue?storeId=&from=&to=&groupBy=`
- `GET /api/v1/analytics/profit`
- `GET /api/v1/analytics/inventory` — turnover, valuation, waste %
- `GET /api/v1/analytics/employees` — productivity ranking
- `GET /api/v1/analytics/stores` — comparison across stores
- `GET /api/v1/analytics/food` — top sellers, low performers
- `GET /api/v1/analytics/export?type=csv|pdf&report=` — generates and returns a download URL
- These endpoints should primarily use MongoDB aggregation pipelines in the repository layer — keep heavy aggregation logic in `repositories/`, not pulled into Python and computed in-memory, for performance at scale.

---

## 6. Database Schema (MongoDB) — Authoritative Field Reference

> Module 4's AI layer queries these collections directly via natural-language-to-aggregation. Field names here are final — Modules 2/3/4 will reference these exact names.

### `businesses`
```
_id, name, ownerId, industry, createdAt, updatedAt
```

### `users`
```
_id, businessId, name, email, passwordHash, role (OWNER|MANAGER|WORKER|SUPER_ADMIN),
assignedStore (ObjectId|null), isActive, lastLogin, refreshToken (hashed), createdAt, updatedAt
```
Index: `{ email: 1 }` unique, `{ businessId: 1, role: 1 }`

### `stores`
```
_id, businessId, name, type, status (OPEN|CLOSED|INACTIVE), location, openingHours,
managerId, phone, isActive, createdAt, updatedAt
```
Index: `{ businessId: 1 }`

### `ingredients`
```
_id, businessId, name, category, unit, minimumStock, maximumStock, currentStock,
supplierId, purchasePrice, averageCost, barcode, createdAt, updatedAt
```
Index: `{ businessId: 1, name: 1 }`, `{ businessId: 1, currentStock: 1 }` (for low-stock queries)

### `suppliers`
```
_id, businessId, name, contact, email, phone, address, isActive, createdAt, updatedAt
```

### `recipes`
```
_id, businessId, name, ingredients: [{ ingredientId, quantity, unit, optional, notes }],
preparationSteps: [string], servingSize, images: [string], status (DRAFT|APPROVED),
versions: [{ versionNumber, ingredients, preparationSteps, updatedAt, updatedBy }],
isAiGenerated, createdAt, updatedAt
```

### `food_items`
```
_id, businessId, recipeId, name, category, price, cost, estimatedProfit,
preparationTime, assignedStores: [ObjectId], image, status (ACTIVE|INACTIVE), createdAt, updatedAt
```

### `daily_assignments`
```
_id, businessId, storeId, ingredientId, allocatedQuantity, returnedQuantity, date, createdAt
```

### `sales`
```
_id, businessId, storeId, items: [{ foodItemId, quantity, unitPrice, subtotal }],
paymentMethod, discount, tax, netRevenue, grossProfit, device, createdBy, status (COMPLETED|REFUNDED),
createdAt, updatedAt
```
Index: `{ businessId: 1, storeId: 1, createdAt: -1 }`

### `attendance`
```
_id, businessId, userId, storeId, clockIn, clockOut, date, status (PRESENT|LATE|ABSENT|LEAVE), createdAt
```

### `assignment` (store-worker assignment, distinct from daily_assignments)
```
_id, businessId, userId, storeId, assignedAt, assignedBy, isActive
```

### `tickets`
```
_id, businessId, title, description, priority, status, raisedBy, assignedTo,
comments: [{ userId, text, createdAt }], attachments: [string], createdAt, updatedAt
```

### `notifications`
```
_id, businessId, userId, type, title, body, isRead, payload, createdAt
```

### `inventory_logs` (immutable ledger — the most important collection)
```
_id, businessId, ingredientId, storeId, workerId, action
  (PURCHASE|SALE|TRANSFER|RETURN|ALLOCATION|WASTE|ADJUSTMENT),
quantity, before, after, referenceType, referenceId, reason, timestamp
```
Index: `{ businessId: 1, ingredientId: 1, timestamp: -1 }`, `{ businessId: 1, storeId: 1, timestamp: -1 }`
**Never update or delete documents in this collection.**

### `purchase_orders`
```
_id, businessId, supplierId, ingredientId, quantity, unitPrice, totalCost, status, createdAt
```

### `stock_transfers`
```
_id, businessId, ingredientId, fromStoreId, toStoreId, quantity, status, createdAt
```

### `audit_logs`
```
_id, businessId, userId, action, module, documentId, oldValue, newValue, timestamp
```
Write to this from a shared `audit_service.log(...)` helper called by every mutating service method. Never delete.

### `ai_conversations`
```
_id, businessId, userId, title, createdAt, updatedAt
```

### `ai_messages`
```
_id, conversationId, businessId, role (user|assistant|tool), content, toolCalls, toolResults, createdAt
```

### `settings`
```
_id, businessId, currency, timezone, language, notificationSettings, aiSettings, theme, taxRate, workingHours
```

**Universal rule:** every document gets `createdAt` and `updatedAt` (UTC, set in repository layer via a shared base mixin, not left to the caller).

---

## 7. Background Workers / Scheduled Jobs

Implement in `app/workers/` using APScheduler:
1. **Low stock checker** — runs hourly, scans `ingredients` where `currentStock <= minimumStock`, fires `notification_service.send(...)` to OWNER/MANAGER, deduplicated (don't re-notify every hour for the same item — track last-notified timestamp).
2. **Food cost recalculation** — triggered async (not cron) whenever an ingredient's `averageCost` changes meaningfully (>2%); recomputes `cost`/`estimatedProfit` for all food items using that ingredient via their recipes.
3. **Daily report generator** — runs at each store's configured closing time (from `stores.openingHours`), aggregates the day's sales/inventory into a stored daily report document (add a `daily_reports` collection if not already covered — extend the schema, document it, and use it consistently in Module 2).
4. **Refresh token cleanup** — purges expired refresh tokens periodically.

---

## 8. Security Checklist

- Passwords hashed with `bcrypt` (via `passlib`).
- Rate limit `/auth/login` and `/auth/forgot-password` (use `slowapi` or Redis-based limiter).
- CORS configured explicitly for the frontend/mobile origins — never `allow_origins=["*"]` in production config.
- All file uploads validated for type/size before storage; store in S3-compatible storage or local disk behind a service abstraction (`utils/file_storage.py`) so swapping providers later doesn't ripple through the codebase.
- Sanitize all user input that touches Mongo queries to prevent NoSQL injection (Pydantic validation covers most of this, but never interpolate raw user strings into `$where` or similar).
- `.env` holds: `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `OPENROUTER_API_KEY` (for Module 4), SMTP credentials. Never commit `.env`.

---

## 9. Build Order (do not skip ahead)

1. `config.py`, `database/` connection, `main.py` skeleton with health check route.
2. `models/` for `business.py`, `user.py`, base mixin for timestamps.
3. Auth module end-to-end (register/login/refresh) — this unlocks `Depends(get_current_user)` for everything else.
4. `dependencies/` RBAC guards.
5. Store + User modules.
6. Ingredient + Inventory module (the ledger logic is foundational — recipes and food cost depend on it).
7. Recipe + Food Menu modules.
8. Sales module (depends on Food + Inventory).
9. Attendance + Employee modules.
10. Ticket + Notification modules.
11. Analytics module (depends on everything above having real data to aggregate).
12. Workers/scheduled jobs.
13. `ai.py` router as a stub only (returns 501) — full implementation is Module 4.

**Before moving to Module 2:** confirm every endpoint above returns the standard response envelope, confirm Swagger/OpenAPI docs are auto-generating correctly at `/docs`, and export the OpenAPI schema to `docs/openapi.json` — Module 2's agent will use this as ground truth for API integration instead of re-reading this whole file.
