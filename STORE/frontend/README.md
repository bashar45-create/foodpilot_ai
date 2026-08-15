# STORE Frontend

Monochrome Vite + React + TypeScript dashboard scaffold for STORE.

## Highlights

- White/black visual system with clean spacing and sharp contrast
- React Router application shell with protected routes
- React Query client and API client with typed response envelope handling
- Auth provider using in-memory access token storage
- Shared layout and reusable UI primitives
- Page shells for the major Module 2 areas

## Requirements

Download and install these before running the app:

1. [Node.js 20+](https://nodejs.org/)
2. npm, which ships with Node.js
3. The backend from Module 1 running at `http://localhost:8000`
4. Optional: Git for version control

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Open the app at `http://localhost:5173`.

## Environment

Copy `.env.example` to `.env` and update the API URL if needed.

```bash
VITE_API_BASE_URL=http://localhost:8000
```

## Scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - type-check and build for production
- `npm run preview` - preview the production build
- `npm run check` - run TypeScript type checking only

## Notes

- Access tokens are kept in memory only.
- Refresh token support is wired through the API client, but the backend still needs its final production cookie flow if you want full silent auth.
- Most pages are currently shells so the UI structure is in place while Module 1 routes are finalized.
