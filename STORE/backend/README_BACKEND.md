# Backend Overview — STORE (backend)

This document explains how the backend (FastAPI + MongoDB) is organized, what API routes exist, and how the main pieces work — written in simple language so you can learn quickly.

---

## Quick start (run locally)

1. Create and activate a virtual environment:

```powershell
cd backend
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# or cmd: .venv\Scripts\activate
```

2. Install dependencies and start the server:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

3. Useful URLs after the server is running:

- API base (example): `http://localhost:8000/api/v1`
- Health: `http://localhost:8000/api/v1/health`
- Swagger UI: `http://localhost:8000/docs`
- OpenAPI JSON (auto-exported at startup): `backend/docs/openapi.json`

---

## Configuration / environment variables

Settings are read from a `.env` file (or environment variables). Key variables you should know (see `app/config.py`):

- `APP_ENV` — environment (development/production)
- `MONGO_URI` — MongoDB connection string (default: `mongodb://localhost:27017`)
- `MONGO_DB_NAME` — database name (default: `store_erp`)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — secrets for signing tokens
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — default admin credentials for dev
- `REDIS_URL` — optional Redis used by some services
- `OPENROUTER_API_KEY` — API key for the AI integration (optional)

---

## High-level architecture (easy language)

- The app is a FastAPI application defined in `app/main.py`.
- Routes are grouped into small files under `app/api/` (one module per domain, e.g. `users.py`, `stores.py`).
- Business logic is in `app/services/` (services talk to repositories/databases).
- Database access uses Motor (async MongoDB client) via `app/database/client.py`.
- Authentication uses JWT tokens and an HTTP Bearer scheme (`app/core/security.py` and `app/dependencies/auth.py`).
- Responses are returned in a simple envelope: success responses look like `{ success: true, data: ... }` and errors like `{ success: false, error: { code, message } }` (see `app/core/response.py`).
- A WebSocket endpoint provides realtime sync (`/api/v1/ws`).
- The AI assistant is available under `/api/v1/ai` and uses `app/services/ai_service.py`.

---

## Main entry points and middleware

- `app/main.py`:
  - Creates the FastAPI app, registers CORS middleware, includes `api_router` (all API routes), and sets up exception handlers.
  - On startup it opens a MongoDB connection and exports the OpenAPI schema to `backend/docs/openapi.json`.
  - Provides a small health-check endpoint at `/api/v1/health`.

---

## Routers (what API groups exist)

The routers are mounted under `/api/v1` and are defined in `app/api/__init__.py`. Below is a friendly summary of each module and the main endpoints they provide.

- `auth` (`/api/v1/auth`)
  - `POST /login` — login with username/password, returns `accessToken` and `refreshToken` (dev admin login is supported via env credentials).
  - `POST /refresh-token` — exchange refresh token for new tokens.
  - `POST /logout`, `GET /me` — user info and logout.
  - (Registration and email/password reset endpoints are stubbed/disabled in this build.)

- `users` (`/api/v1/users`)
  - `GET /` — list users (filter by role/store/active)
  - `GET /{user_id}` — get a single user
  - `POST /` — create a user
  - `PUT /{user_id}` — update
  - `PATCH /{user_id}/status` — enable/disable
  - `PATCH /{user_id}/assign-store` — assign user to a store
  - `PATCH /{user_id}/reset-password` — manager resets a user's password

- `stores` (`/api/v1/stores`)
  - `GET /` — list stores
  - `GET /{store_id}` — store details
  - `POST /` — create a store
  - `PUT /{store_id}` — update store
  - `PATCH /{store_id}/status` — update open/closed
  - `POST /{store_id}/open` and `/close` — helpers to set status
  - `GET /{store_id}/analytics` and `/performance` — scaffolds for reports

- `inventory` (`/api/v1/inventory`)
  - Ingredient CRUD: `GET /ingredients`, `POST /ingredients`, `GET /ingredients/{id}`, `PUT`, `DELETE`.
  - `GET /low-stock` — list low stock ingredients
  - `POST /purchase`, `POST /adjust`, `POST /transfer` — recording purchase/adjust/transfer events
  - `POST /allocate-food` — allocate a food item to a store using its recipe (atomically deducts ingredients)
  - `GET /history/{ingredient_id}` — inventory movement history

- `recipes` (`/api/v1/recipes`) and `food` (`/api/v1/food`)
  - Food & recipe listing, get by id, create food/recipe, and update. Recipes are used by `allocate-food`.

- `sales` (`/api/v1/sales`)
  - `POST /` — record a sale/payment (creates transactions and adjusts inventory / allocations depending on config).

- `allocations` (`/api/v1/allocations`)
  - Endpoints to list/store allocations and summaries.

- `tickets` (`/api/v1/tickets`)
  - Create and manage support/operational tickets.

- `notifications` (`/api/v1/notifications`), `reports`, `analytics`
  - Endpoints for notifications, generating reports, and analytics summary endpoints.

- `ai` (`/api/v1/ai`)
  - `POST /conversations` — create AI conversation
  - `GET /conversations` — list
  - `GET /conversations/{id}`, `PATCH /conversations/{id}`, `DELETE /conversations/{id}` — manage conversations
  - `POST /chat` — send a message to the AI assistant (the AI runs in `app/services/ai_service.py` and persisting messages to the DB)
  - `GET /quick-prompts` — small helper to surface canned AI prompts

- `mcp` (`/api/v1/mcp`) and `ws` (WebSocket)
  - `mcp` exposes a small manifest/status for MCP-related tooling.
  - `ws` provides a WebSocket endpoint at `/api/v1/ws` used for real-time sync; connections are authenticated via a token query param and receive sync events published by the `sync_service`.

(The code organizes each domain in a separate `app/api/*.py` file — open any of these files directly to see parameter names and request/response shapes.)

---

## How authentication works (simple)

1. Client logs in with `POST /api/v1/auth/login`.
2. Server returns an `accessToken` (short-lived) and a `refreshToken` (longer-lived).
3. The client sends the `accessToken` in the `Authorization: Bearer <token>` header.
4. The `get_current_user` dependency decodes the JWT and provides a `CurrentUser` model to route handlers.
5. If a token is expired, the dependency raises a 401 error and the client can call `POST /api/v1/auth/refresh-token` with the refresh token to get new tokens.

The JWT helper functions live in `app/core/security.py`.

---

## Database access pattern

- `app/database/client.py` exposes a `mongo_manager` which lazily creates a Motor client and returns a `get_database()` helper.
- Services (in `app/services`) call `get_database()` or accept a `db` via DI and perform async operations on collections.
- Repositories are thin helpers around Mongo collections (see `app/repositories/*`), and services implement higher-level business rules and validation.

---

## WebSockets / sync (how realtime works)

- The WebSocket endpoint is `/api/v1/ws` (see `app/api/ws.py`).
- Clients connect with a `token` query parameter for authentication.
- Once connected, the server subscribes the socket to a `sync_service` channel scoped to the business ID and streams `SyncEvent` objects (Pydantic models) as JSON.
- The server includes an idle watchdog to close idle connections.

---

## AI assistant (how chat works)

- The AI endpoints call `app/services/ai_service.py`.
- The AI service uses an internal agent (`app/ai/agent.py`) that may call external LLM providers (configured via `OPENROUTER_API_KEY`).
- Conversations and messages are persisted in Mongo (helper functions live in `app/ai/memory.py`).
- `POST /api/v1/ai/chat` appends the user's message, runs the agent with a short history, persists the assistant response, and returns the assistant message (including any tool call metadata).

---

## Error handling and response format

- The app defines `AppException` subclasses (NotFound, Conflict, Validation, Unauthorized, Forbidden) in `app/core/exceptions.py`.
- These exceptions are converted to JSON responses by exception handlers in `app/main.py` using the `error_payload` envelope.
- Success responses always use `success_payload`.

---

## Where to look next (recommended file tour)

- `app/main.py` — app boot, middleware, startup/shutdown.
- `app/api/*.py` — the API surface. Open files where you want to learn endpoints.
- `app/services/*.py` — business logic (where the "real work" happens).
- `app/repositories/*.py` — direct DB helpers.
- `app/database/client.py` — Mongo client management.
- `app/core/security.py` — JWT and password hashing.
- `app/dependencies/*` — auth and role guards.
- `app/ai/*` — AI agent, prompts, and message storage.

---

## Example curl (login + get user info)

```bash
# Login (dev admin uses ADMIN_USERNAME/ADMIN_PASSWORD)
curl -X POST "http://localhost:8000/api/v1/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'

# Use returned access token to call /me
curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:8000/api/v1/auth/me"
```

---

## Final notes and tips for learning

- Start by running the server and exploring the Swagger UI (`/docs`). It's the fastest way to see request and response shapes.
- Follow one domain end-to-end: open `app/api/<domain>.py`, then `app/services/<domain>_service.py`, then `app/repositories/<something>`. This shows how requests flow from HTTP into DB.
- Add print/logging statements during dev or run the app in the debugger to step through service code.
- If you want, I can generate a per-endpoint catalog (CSV or a more exhaustive Markdown) listing every route, expected request body schema, and response sample.

---

Created by your code helper — placed at `backend/README_BACKEND.md`.
