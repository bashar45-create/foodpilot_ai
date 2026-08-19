# STORE

STORE is a multi-tenant smart multi-store ERP platform.

## Repository Structure

- `backend/` - FastAPI + MongoDB backend from Module 1
- `frontend/` - React web dashboard from Module 2
- `docs/` - generated OpenAPI schema and supporting docs

## Requirements

Download and install:

1. [Node.js 20+](https://nodejs.org/)
2. [Python 3.13](https://www.python.org/downloads/)
3. MongoDB Atlas access for the backend
4. Redis if you want the backend services to use caching and jobs as implemented
5. Git

## Quick Start

### Backend

```bash
cd backend
# STORE

STORE is a multi-tenant smart multi-store ERP platform with three product surfaces:

- Backend API (FastAPI + MongoDB)
- Web Dashboard (React + Vite + TypeScript)
- Mobile Worker App (React Native + Expo)

An AI Assistant module is designed to run through the backend and query operational data.

## Clone & Setup

Get the project running locally in a few minutes.

### 1) Clone the repository

Clone the default branch (currently `main`):

```powershell
git clone https://github.com/  /STORE.git
cd STORE
```

To clone a specific branch (e.g. ` `) directly:

```powershell
git clone -b   https://github.com/  /STORE.git
cd STORE
```

Or clone `main` and switch later:

```powershell
git clone https://github.com/  /STORE.git
cd STORE
git fetch origin
git checkout  
```

### 2) Prerequisites

Make sure these are installed:

- [Git](https://git-scm.com/)
- [Python 3.13+](https://www.python.org/downloads/)
- [Node.js 20+](https://nodejs.org/) and npm 10+
- [MongoDB](https://www.mongodb.com/) (Atlas or local)
- [Redis](https://redis.io/) (recommended for caching, rate limiting, background jobs)
- [Expo Go](https://expo.dev/client) (only if you plan to run the mobile app on a device)

### 3) Backend (Module 1)

```powershell
cd STORE
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
# source .venv/bin/activate

START :

py -m venv .venv
.venv\Scripts\Activate.ps1



python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create `backend/.env` (use the keys shown further down in this README under **Full Setup Guide**).

Start it:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- API: <http://localhost:8000/api/v1>
- Swagger UI: <http://localhost:8000/docs>

### 4) Web dashboard (Module 2)

```powershell
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

### 5) Mobile app (Module 3)

```powershell
cd mobile
npm install
npm run start
```

Scan the QR code with Expo Go, or use `npm run android` / `npm run ios`.

### 6) Verify everything

In three separate terminals, run:

1. `cd backend && uvicorn app.main:app --reload`
2. `cd frontend && npm run dev`
3. `cd mobile && npm run start`

Visit <http://localhost:8000/api/v1/health> and <http://localhost:5173> to confirm.

### Tips for new contributors

- **Default login** (development): `admin` / `admin123` (configurable via `ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars).
- **Each subproject is independent** — open `backend/`, `frontend/`, and `mobile/` in separate editor windows or workspaces.
- **Generated files are gitignored** — you don't need to commit `.venv/`, `node_modules/`, `dist/`, `.expo/`, etc.
- **Local-only state is gitignored** — `.claude/`, `.specify/`, `.puku-cli/`, and `CLAUDE.md` are intentionally not tracked.
- **API contract lives at `docs/openapi.json`** — keep it in sync if you change backend routes.

## Monorepo Structure

```text
STORE/
|- backend/                     # Module 1: API, business logic, data layer
|- frontend/                    # Module 2: web dashboard
|- mobile/                      # Module 3: worker mobile app
|- docs/openapi.json            # exported API schema
|- MODULE_1_BACKEND.md          # backend specification
|- MODULE_2_WEB_DASHBOARD.md    # web specification
|- MODULE_3_MOBILE_APP.md       # mobile specification
|- MODULE_4_AI_INTEGRATION.md   # AI integration specification
```

## Architecture Summary

1. Backend is the source of truth for business rules and data.
2. Frontend and mobile clients consume backend routes under `/api/v1/...`.
3. AI integration is read-only in v1 and should reuse backend services, not duplicate logic.
4. Multi-tenancy is enforced by `businessId` scoping in backend data access.

## Requirements

Install these before setup:

1. Git
2. Python 3.13+
3. Node.js 20+
4. npm 10+
5. MongoDB Atlas (or local MongoDB for development)
6. Redis (recommended for rate limiting, caching, and background workers)
7. Expo Go (for mobile development on device)

## Full Setup Guide

### 1) Clone and enter project

```powershell
git clone https://github.com/  /STORE.git
cd STORE
```

### 2) Backend setup (Module 1)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate(windows)
source .venv/bin/activate(linux)
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create or update `backend/.env` with at least the following keys:

```env
APP_ENV=development
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=store_erp
JWT_SECRET=replace-with-a-strong-secret
JWT_REFRESH_SECRET=replace-with-a-different-strong-secret
REDIS_URL=redis://localhost:6379/0
OPENROUTER_API_KEY=
APP_CORS_ORIGINS=http://localhost:5173,http://localhost:19006
```

Start backend:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Useful backend endpoints:

- Health: `http://localhost:8000/api/v1/health`
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

Smoke checks (from `backend/`):

```powershell
python tests/mongocheck.py
python tests/workload_check.py
```

### 3) Web dashboard setup (Module 2)

```powershell
cd .\frontend
npm install
npm run dev
```

Default local URL: `http://localhost:5173`

Other commands:

```powershell
npm run check
npm run build
npm run preview
```

### 4) Mobile app setup (Module 3)

```powershell
cd .\mobile
npm install
npm run start
```

Then:

1. Open Expo Dev Tools.
2. Run on Android/iOS simulator or scan QR using Expo Go.

Other commands:

```powershell
npm run android
npm run ios
npm run web
npm run check
```

## Module Details

### Module 1: Backend and Database

Tech stack:

- FastAPI
- Motor (MongoDB async driver)
- Pydantic v2
- JWT auth (access + refresh)
- Redis
- APScheduler

Backend layering rule:

```text
api/ -> services/ -> repositories/ -> database/
```

Key backend domains:

- Auth
- Users and RBAC
- Stores
- Inventory and suppliers
- Recipes and food menu
- Sales and reports
- Attendance and assignments
- Tickets and notifications
- Analytics
- AI API surface

Reference: `MODULE_1_BACKEND.md`

### Module 2: React Web Dashboard

Core stack:

- React + TypeScript + Vite
- React Router
- React Query
- react-hook-form + zod
- Tailwind CSS
- Recharts

Primary functional areas:

- Authentication pages
- Dashboard and KPIs
- Stores and employee management
- Inventory, recipes, and food menu
- Sales, reports, and analytics
- Tickets and notifications
- Settings, profile, and audit logs
- AI Assistant UI shell

Reference: `MODULE_2_WEB_DASHBOARD.md`

### Module 3: Mobile Worker App

Core stack:

- React Native (Expo)
- React Navigation
- React Query
- expo-sqlite (offline queue)
- expo-secure-store (token storage)
- NetInfo and push notifications

Worker-focused capabilities:

- Login and token-based session handling
- Clock in/out
- Inventory allocation and returns
- Offline sale recording and sync
- Recipe viewing (read-only)
- Ticket submission
- Profile and notifications

Reference: `MODULE_3_MOBILE_APP.md`

### Module 4: AI Integration

AI assistant design goals:

- Chat-style assistant for operational Q and A
- Tool-call-first behavior for numeric/data answers
- Read-only tool set in v1
- Conversation persistence
- Uses OpenRouter API key from backend environment

Reference: `MODULE_4_AI_INTEGRATION.md`

## API Contract

The backend exports OpenAPI schema to:

- `docs/openapi.json`

Frontend and mobile should treat this as the route and payload source of truth.

## Development Notes

1. Keep backend, frontend, and mobile contracts aligned with `docs/openapi.json`.
2. Keep multi-tenant scoping (`businessId`) enforced in all backend data access.
3. Avoid bypassing backend service/repository boundaries.
4. For AI answers involving numbers, require tool-based grounding against backend services.

## Common Run Order (Local)

1. Start MongoDB and Redis.
2. Start backend on port 8000.
3. Start frontend on port 5173.
4. Start mobile via Expo.
5. Validate API docs at `/docs` and health endpoint.

## Licensing

No license file is currently defined in this repository.