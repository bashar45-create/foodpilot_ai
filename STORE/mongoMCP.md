# MongoDB MCP for STORE

This document describes how the **STORE** ERP uses the official [`mongodb-mcp-server`](https://github.com/mongodb-js/mongodb-mcp-server) as a **strictly read-only** query layer, and how it integrates with the AI Assistant page in the admin dashboard.

> **TL;DR.** The MCP server runs locally with `--readOnly` against the same MongoDB instance the FastAPI backend uses. The AI Assistant page in `/ai-assistant` talks to the backend's `LangChain` agent (OpenRouter) for chat-style questions; the **Data** tab inside that page uses a thin **in-app MCP-style bridge** (`/api/v1/mcp/*`) that mirrors the official server's read-only surface (`find`, `aggregate`, `count`, `list-collections`, `list-indexes`, `server_status`) and adds business-scope enforcement. External MCP clients (Claude Desktop, etc.) connect via the `.mcp.json` we ship at the repo root.

---

## 1. Why MCP, and why read-only

The AI Assistant must answer operational questions with **real numbers** — never hallucinated ones. Two complementary paths make that safe:

1. **LangChain agent path** (chat). Uses LangChain tools that wrap the backend's existing services (`sales_service`, `inventory_service`, …). Already implemented in `backend/app/ai/`.
2. **Direct MCP bridge path** (Data tab). Calls a tiny in-app HTTP bridge that exposes the same `find` / `aggregate` / `count` surface as the official MongoDB MCP server, but with two extra guarantees:
   - **Always read-only.** No `insert`, `update`, `delete`, `drop`, `create-index`, `$out`, `$merge`, etc.
   - **Always business-scoped.** The bridge injects `{ businessId: <jwt.businessId> }` into every filter/aggregation; callers cannot bypass it.

External MCP clients (Claude Desktop, VS Code MCP, …) connect via the **official `mongodb-mcp-server`** started with `--readOnly`, so the same safety guarantees apply at the host level.

---

## 2. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 22.13.0 | The official server requires Node 22.x (20.x is deprecated). |
| MongoDB 6.0+ | Local or Atlas; Atlas works fine via `mongodb+srv://…`. |
| A **read-only** MongoDB user | Strongly recommended as defense-in-depth, even though the server is already started with `--readOnly`. |
| `npx` available | Used to run `mongodb-mcp-server@latest` without a global install. |

---

## 3. Create a read-only MongoDB user (recommended)

Even with `--readOnly`, creating a MongoDB user that has **only** `find` and `aggregate` privileges is a belt-and-braces measure — useful for production / shared environments.

```javascript
// In mongosh against your database
use store_erp;

db.createUser({
  user: "store_mcp_reader",
  pwd: "<strong-random-password>",
  roles: [
    {
      role: "read",
      db: "store_erp"
    }
  ]
});
```

`read` on `store_erp` grants `find`, `aggregate`, `listCollections`, `listIndexes`, `collStats`, and similar read-only actions — exactly what the bridge uses. It does **not** grant `insert`, `update`, `remove`, `createIndex`, `dropCollection`, etc.

Test it:

```bash
mongodb://store_mcp_reader:<password>@localhost:27017/store_erp
```

If you prefer, you can also use the built-in `readAnyDatabase` role with auth source `admin` for a multi-tenant MCP client, but `read` on a single database is safer for the STORE case where each business has its own data scope.

---

## 4. Configuration files shipped in this repo

### 4.1 `.mcp.json` (workspace root)

The root `.mcp.json` declares two transports for the same MCP server:

```jsonc
{
  "mcpServers": {
    "store-mongodb": {
      "command": "npx",
      "args": ["-y", "mongodb-mcp-server@latest", "--readOnly", "--transport", "stdio"],
      "env": {
        "MDB_MCP_CONNECTION_STRING": "mongodb://localhost:27017/store_erp",
        "MDB_MCP_READ_ONLY": "true"
      }
    },
    "store-mongodb-http": {
      "command": "npx",
      "args": [
        "-y", "mongodb-mcp-server@latest",
        "--readOnly",
        "--transport", "http",
        "--httpHost", "127.0.0.1",
        "--httpPort", "8080"
      ],
      "env": {
        "MDB_MCP_CONNECTION_STRING": "mongodb://localhost:27017/store_erp",
        "MDB_MCP_READ_ONLY": "true"
      }
    }
  }
}
```

- `store-mongodb` is the stdio transport — picked up by VS Code MCP and any IDE that auto-discovers `.mcp.json` in the workspace.
- `store-mongodb-http` runs the same server as an HTTP service on `127.0.0.1:8080`, useful when you want to test with `curl` or wire it into a script.

> Both transports are started with `--readOnly`, and `MDB_MCP_READ_ONLY="true"` is set as a redundant environment flag — even if the CLI flag is dropped later, the env var still enforces read-only.

### 4.2 `docs/claude_desktop_config.example.json`

A copy-pasteable snippet for Claude Desktop's MCP config. Copy to your OS-specific path:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Merge the snippet into the existing `mcpServers` block — don't overwrite other servers you may have configured.

### 4.3 `.env` for the backend

The backend already has `MONGO_URI` / `MONGO_DB_NAME` in `backend/app/config.py`. They are independent of MCP — the MCP server talks to MongoDB directly, not through FastAPI. Keep them aligned so both the app and the MCP server hit the same database.

```env
# backend/.env
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=store_erp

# Use a read-only user for the MCP server:
MDB_MCP_CONNECTION_STRING=mongodb://store_mcp_reader:<password>@localhost:27017/store_erp
```

---

## 5. The in-app MCP bridge (`/api/v1/mcp/*`)

The backend exposes a small set of read-only routes that mirror the official MCP server's surface. This lets the **Data** tab in the AI Assistant page query MongoDB without needing the user to install the MCP server separately.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/mcp/manifest` | Lists allowed tools, collections, limits, blocked operators/stages. |
| `GET` | `/api/v1/mcp/status` | Returns `{ok, version, readOnly, scopedBy}`. |
| `GET` | `/api/v1/mcp/collections` | Lists collections in scope + a sample of fields per collection. |
| `GET` | `/api/v1/mcp/collections/{name}/indexes` | Lists indexes for a single collection. |
| `POST` | `/api/v1/mcp/find` | `{collection, filter?, projection?, sort?, limit}` → docs. |
| `POST` | `/api/v1/mcp/count` | `{collection, filter?}` → `{count}`. |
| `POST` | `/api/v1/mcp/aggregate` | `{collection, pipeline, limit}` → docs. |

All require authentication (`get_current_user` dependency). The bridge:

1. Validates the collection name against an explicit allowlist (`ALLOWED_COLLECTIONS` in `backend/app/services/mcp_service.py`).
2. Strips unsafe Mongo operators from incoming filters and pipelines (`$where`, `$expr`, `$function`, `$accumulator`, `$jsonSchema`, etc.).
3. Refuses aggregation stages that could write or leak internals (`$out`, `$merge`, `$currentOp`, `$killCursors`, …).
4. Injects `{ businessId: <jwt.businessId> }` into every query — even if the caller passes a different businessId in the filter, it's overridden server-side.
5. Caps result sizes (`MAX_LIMIT = 200`, `MAX_PIPELINE_STAGES = 12`, `MAX_AGGREGATION_RESULTS = 500`).

The manifest endpoint makes all of the above introspectable:

```bash
curl -s http://localhost:8000/api/v1/mcp/manifest \
  -H "Authorization: Bearer <jwt>" | jq
```

```json
{
  "success": true,
  "data": {
    "name": "store-mcp-readonly",
    "version": "1.0.0",
    "description": "Read-only MongoDB bridge for the STORE ERP, scoped by businessId.",
    "transport": ["http", "stdio"],
    "tools": ["list_collections", "find", "aggregate", "count", "list_indexes", "server_status"],
    "collections": ["ai_conversations", "ai_messages", "allocations", "attendance", "food_items", "ingredients", "inventory_logs", "notifications", "recipes", "sales", "store_inventory", "stores", "tickets", "users"],
    "limits": { "maxLimit": 200, "maxPipelineStages": 12, "maxAggregationResults": 500 },
    "blockedOperators": ["$accumulator", "$expr", "$function", "$jsonSchema", "$where"],
    "blockedStages": ["$currentOp", "$indexStats", "$killCursors", "$listLocalSessions", "$listSessions", "$merge", "$out", "$planCacheStats"]
  }
}
```

A real query:

```bash
curl -s http://localhost:8000/api/v1/mcp/find \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"collection":"sales","filter":{"channel":"POS"},"limit":10}'
```

The response is scoped automatically — no `businessId` is accepted from the caller.

---

## 6. How the AI Assistant page uses this

`/ai-assistant` is split into two tabs:

### 6.1 **Chat** tab

Talks to the existing LangChain agent at `POST /api/v1/ai/chat`. The agent uses tools that wrap the backend's services — it's grounded in real data and the system prompt forbids fabrication. This path is unchanged by the MCP integration.

### 6.2 **Data** tab

A lightweight query console that calls the bridge directly:

- **Left rail**: lists allowed collections, blocked operators, and connection status (live from `/mcp/status`).
- **Right panel**: JSON editor + `find` / `count` / `aggregate` buttons; results render in a monospaced dark pane.
- Useful for "let me just check this number" workflows without invoking the LLM round-trip — and because the bridge is read-only, it's safe to let admins play with it.

Both tabs share the same business scope and authentication.

---

## 7. Running the MCP server manually

Quick test without an MCP client:

```bash
# stdio transport — useful for piping into a host that expects JSON-RPC over stdio:
npx -y mongodb-mcp-server@latest --readOnly

# HTTP transport — test with curl:
npx -y mongodb-mcp-server@latest --readOnly \
  --transport http --httpHost 127.0.0.1 --httpPort 8080 &

# Health check:
curl -s http://127.0.0.1:8080/health
```

For Atlas, swap the connection string:

```bash
MDB_MCP_CONNECTION_STRING="mongodb+srv://store_mcp_reader:<password>@<cluster>.mongodb.net/store_erp" \
  npx -y mongodb-mcp-server@latest --readOnly
```

---

## 8. Environment variable reference

The full set of variables the official `mongodb-mcp-server` understands (only `MDB_MCP_CONNECTION_STRING` and `MDB_MCP_READ_ONLY` are required for STORE):

| Variable | Default | Purpose |
|---|---|---|
| `MDB_MCP_CONNECTION_STRING` | _(required)_ | MongoDB URI; `mongodb://` or `mongodb+srv://`. |
| `MDB_MCP_READ_ONLY` | `"false"` | When `"true"`, disables every write tool (`insert`, `update`, `delete`, `drop`, `createIndex`, …). |
| `MDB_MCP_API_CLIENT_ID` | _(unset)_ | Atlas service-account client ID for Atlas-only tools. |
| `MDB_MCP_API_CLIENT_SECRET` | _(unset)_ | Atlas service-account client secret. |
| `MDB_MCP_LOG_LEVEL` | `"info"` | `debug`, `info`, `warn`, `error`. |

CLI flags that correspond to the above: `--readOnly`, `--transport http\|stdio`, `--httpHost`, `--httpPort` (default `127.0.0.1:3000`).

---

## 9. Verifying it works

1. **Backend health**
   ```bash
   curl -s http://localhost:8000/api/v1/health
   # → {"success":true,"data":{"status":"ok"}, ...}
   ```

2. **Bridge manifest is reachable**
   ```bash
   curl -s http://localhost:8000/api/v1/mcp/manifest \
     -H "Authorization: Bearer <jwt>" | jq .data.collections | head
   ```

3. **A simple find round-trip**
   ```bash
   curl -s http://localhost:8000/api/v1/mcp/count \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -d '{"collection":"sales"}' | jq
   # → {"success":true,"data":{"count": 1234}, ...}
   ```

4. **External MCP client** — open Claude Desktop with the config from §4.2, then ask:
   > "Using the store-mongodb MCP server, how many sales records are in the sales collection for this business?"

   Claude should call `count` and return a real number (or an error if it can't reach the database — never a hallucinated one).

5. **From the dashboard** — sign in, open **AI Assistant → Data**, pick `sales` in the collection dropdown, click **count**. You should see a green status pill and a number in the result pane.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `MCP_COLLECTION_NOT_ALLOWED` from the bridge | Trying to query a collection not in `ALLOWED_COLLECTIONS` | Add the collection name to the allowlist in `backend/app/services/mcp_service.py` **and** confirm it has a `businessId` field. |
| `MCP_FORBIDDEN_STAGE` / `MCP_PIPELINE_TOO_LONG` | Pipeline used `$out`/`$merge` or has >12 stages | Remove the forbidden stage; if you need a long pipeline, raise `MAX_PIPELINE_STAGES` after a security review. |
| Bridge returns empty results | Caller passed a filter with `businessId` set to another tenant | Expected — the bridge **always** overrides with the JWT's businessId. Pass no `businessId` in the filter; let the bridge inject it. |
| `mongodb-mcp-server` exits immediately | Node version < 22.13.0 | Upgrade Node to 22.13+ (20.x is deprecated by upstream). |
| Atlas client can't authenticate | `MDB_MCP_API_CLIENT_ID/SECRET` missing or wrong | For Atlas service-account tools, set both env vars. The basic read-only tools work with just `MDB_MCP_CONNECTION_STRING`. |
| Claude Desktop doesn't see the server | Wrong config path or `npx` not on PATH | Re-check the OS-specific path in §4.2; from a terminal run `npx -y mongodb-mcp-server@latest --version` to confirm `npx` works. |

---

## 11. Files added by this work

```
.
├── .mcp.json                                  # workspace MCP config (stdio + http transports)
├── docs/
│   └── claude_desktop_config.example.json     # drop-in snippet for Claude Desktop
├── mongoMCP.md                                # this document
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py                    # registers the mcp_router
│   │   │   └── mcp.py                         # /api/v1/mcp/* routes
│   │   ├── schemas/
│   │   │   └── mcp.py                         # request models (find / aggregate / count)
│   │   └── services/
│   │       └── mcp_service.py                 # the read-only bridge (scoping + sanitization)
└── frontend/
    └── src/
        ├── api/endpoints/
        │   └── ai.ts                          # REST client for /ai/* and /mcp/*
        ├── features/ai-assistant/
        │   └── hooks/
        │       └── use-ai.ts                  # React Query hooks for conversations, send, manifest, status
        ├── components/layout/
        │   └── app-shell.tsx                  # AI Assistant added to the owner sidebar
        └── pages/
            └── ai-assistant-page.tsx          # chat + Data-tab query console
```

The AI Assistant is now wired into the dashboard sidebar at `/ai-assistant`, end-to-end: chat over LangChain tools, plus a read-only data explorer backed by the same safety guarantees as the official `mongodb-mcp-server`.