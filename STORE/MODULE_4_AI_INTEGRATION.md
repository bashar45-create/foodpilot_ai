# MODULE 4 — AI Integration (LangChain)

> **Context for the coding agent:** You are building the AI Assistant feature for **STORE**. The backend (Module 1), web dashboard (Module 2), and mobile app (Module 3) are already built or in progress. This module adds a chat-based AI assistant, accessible from the web dashboard's "AI Assistant" sidebar page, that answers operational questions by querying the live MongoDB data — things like "what were today's sales?" or "how much of ingredient X should I stock tomorrow?". **The AI must be strictly grounded in real data via tool calls — it must not hallucinate numbers.** This is a data-querying assistant, not a general chatbot.

---

## 0. Tech Stack

- LangChain (Python) for orchestration, tool-calling, and conversation memory
- Model access via **OpenRouter** (`OPENROUTER_API_KEY` already provisioned in backend `.env` per Module 1)
- Tools execute as MongoDB aggregation queries through the **existing `services/` and `repositories/` layer from Module 1** — the AI must reuse those, not write parallel raw Mongo queries that could drift from business logic (e.g. the AI's "today's sales" tool must use the same `sales_repository` logic as the Analytics module, so numbers always match what's shown on the dashboard).
- Conversation persistence: `ai_conversations` and `ai_messages` collections (already defined in Module 1's schema — do not redefine).

---

## 1. Product Behavior (what this feature actually is)

From the project owner's original notes: a sidebar page called **AI Helper** opens a chat interface. Left side panel lists previous conversations (like ChatGPT). A row of quick-prompt buttons sits above the input for common questions (e.g. "What were today's sales?", "How much of each ingredient should I stock tomorrow?"). The assistant is connected to the business's data and **must answer strictly using real queries against MongoDB** — it should not provide generic advice disconnected from the business's actual numbers, and it should not invent figures.

**Core principle: tool-call-first, narrate-second.** For any question involving numbers, dates, inventory, sales, or store data, the assistant must call a tool to fetch real data before answering. If no tool can answer the question, it should say so rather than guessing.

---

## 2. Scope Boundary

**In scope for v1:**
- Read-only operational Q&A: sales figures, inventory levels, restock suggestions, recipe costs, employee performance, store comparisons — all backed by tool calls into existing services.
- Conversation history (multi-turn, persisted, resumable).
- Simple restock forecasting (basic heuristic, not full ML forecasting — see Section 5.3).

**Explicitly out of scope for v1 (do not build, do not let the AI attempt):**
- The AI taking write actions (creating sales, adjusting inventory, editing recipes) — even though Module 1 exposes those as callable services, **do not expose write-capable tools to the LLM in v1**. This avoids a model hallucinating a destructive action. If the project owner wants this later, it should be a deliberate, explicitly-confirmed-by-user addition, not default behavior.
- Cross-business data access (the AI must always be scoped to the requesting user's `businessId`, exactly like every other backend endpoint).
- General chit-chat unrelated to the business — keep the system prompt focused; it can be polite and conversational in tone, but it should redirect off-topic requests back to what it can actually help with.

---

## 3. Architecture

```
Frontend (AI Assistant page, Module 2)
        │  POST /api/v1/ai/chat  { conversationId?, message }
        ▼
ai.py (router)
        │
        ▼
ai_service.py
        │  builds LangChain agent with:
        │    - system prompt (Section 4)
        │    - conversation history (loaded from ai_messages)
        │    - tool set (Section 5, calling Module 1 services)
        │    - OpenRouter-backed chat model
        ▼
LangChain agent executes tool calls as needed
        │
        ▼
Response persisted to ai_messages (including tool_calls/tool_results for transparency),
ai_conversations.updatedAt bumped, response returned to frontend
```

### 3.1 Backend additions (extends Module 1's structure, does not replace it)
```
backend/app/ai/
├── agent.py            # LangChain agent construction, system prompt, model config
├── tools/               # one file per tool domain
│   ├── sales_tools.py
│   ├── inventory_tools.py
│   ├── recipe_tools.py
│   ├── employee_tools.py
│   └── store_tools.py
├── memory.py             # loads/saves conversation history to ai_messages
└── prompts.py             # system prompt + quick-prompt button definitions
```
`api/ai.py` and `services/ai_service.py` already exist as stubs from Module 1 (the router was a `501` placeholder) — implement them fully now rather than creating duplicate files.

---

## 4. System Prompt (baseline — refine wording but keep these constraints)

The agent's system prompt must enforce:
1. It is an operational assistant for a specific business's STORE ERP data, scoped to `businessId` from the authenticated session — never reference or imply access to other businesses.
2. It must use tools to answer any question involving numbers, dates, or current state. It must never fabricate a sales figure, stock level, or any other data point.
3. If a tool returns no data or an error, it tells the user plainly rather than guessing a plausible-sounding number.
4. It does not take write actions. If asked to "add stock" or "record a sale" via chat, it explains that it can only answer questions in v1 and directs the user to the relevant dashboard page.
5. Keep responses concise and operational — this is a working tool for store owners/managers, not a conversational companion. Numbers should be presented clearly (tables or short lists where helpful), not buried in prose.

---

## 5. Tools (LangChain tool definitions — each wraps an existing Module 1 service call)

Each tool below must validate/inject `businessId` and (where relevant) `storeId` from the authenticated session context — the LLM should never be able to pass an arbitrary `businessId` as a parameter; it's bound server-side per request, not exposed as an LLM-controllable argument.

### 5.1 Sales Tools (`sales_tools.py`)
- `get_sales_summary(date_range, store_id=None)` → wraps `sales_service`/`analytics_service` revenue and profit aggregation. Powers "What were today's sales?", "How did Store X do this week?".
- `get_top_selling_items(date_range, store_id=None, limit=5)` → wraps food/sales analytics.
- `get_sales_by_payment_method(date_range, store_id=None)`.

### 5.2 Inventory Tools (`inventory_tools.py`)
- `get_current_stock(ingredient_name=None, store_id=None)` → wraps `inventory_service`, returns current stock levels, flags anything at/below minimum.
- `get_low_stock_items(store_id=None)` → wraps the same low-stock query used by the backend's scheduled checker (Module 1, Section 7) and the dashboard's low-stock widget — reuse, don't reimplement.
- `get_stock_history(ingredient_name, date_range, store_id=None)` → wraps `inventory_repository` ledger queries.

### 5.3 Restock Suggestion Tool (`inventory_tools.py`)
- `suggest_restock_quantities(store_id=None, days_ahead=1)` — this answers "How much should I stock tomorrow?"
- **v1 heuristic (explicit, documented, not a black box):** average daily consumption for each ingredient over the trailing 7 (or 14, configurable) days, derived from `inventory_logs` entries with `action: SALE` and `action: ALLOCATION`, projected forward by `days_ahead`, compared against `minimumStock`/`maximumStock` bounds to produce a suggested purchase/allocation quantity. Clamp suggestions to reasonable bounds (never suggest restocking below zero or absurdly above `maximumStock` without flagging it).
- This is intentionally simple for v1. Document in code comments that this is a heuristic, not a trained forecasting model, so the AI's response should frame it as an estimate ("based on the last 7 days, you used about X — consider stocking around Y"), not as certain fact.

### 5.4 Recipe Tools (`recipe_tools.py`)
- `get_recipe_cost(recipe_name_or_id)` → wraps `recipe_service.get_cost`.
- `get_recipe_ingredients(recipe_name_or_id)`.

### 5.5 Employee Tools (`employee_tools.py`)
- `get_employee_performance(employee_name_or_id, date_range)` → wraps employee performance service. OWNER/MANAGER scope only — if a worker somehow reaches this endpoint, restrict to their own data only (defense in depth, even though the AI Assistant page is primarily an OWNER/MANAGER tool per Module 2's sidebar structure).

### 5.6 Store Tools (`store_tools.py`)
- `compare_store_performance(date_range)` → wraps `stores_service`/analytics comparison logic.
- `get_store_status(store_id=None)` → open/closed status, today's summary.

---

## 6. API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/ai/conversations` | Create a new conversation (optionally with an initial message) |
| `GET` | `/api/v1/ai/conversations` | List conversations for current user (paginated, most recent first) |
| `GET` | `/api/v1/ai/conversations/{id}` | Get a conversation with its full message history |
| `DELETE` | `/api/v1/ai/conversations/{id}` | Delete a conversation |
| `POST` | `/api/v1/ai/chat` | Send a message; body `{ conversationId?, message }`; if `conversationId` omitted, creates a new conversation. Returns the assistant's response (and persists both messages). |
| `GET` | `/api/v1/ai/quick-prompts` | Returns the configured list of quick-prompt buttons (so the frontend doesn't hardcode them — defined in `prompts.py`) |

All routes require authentication; `businessId` and `userId` come from the JWT, never from the request body.

**Response shape for `POST /ai/chat`** (fits the standard envelope from Module 1):
```json
{
  "success": true,
  "data": {
    "conversationId": "...",
    "message": {
      "role": "assistant",
      "content": "Today's total revenue across all stores was ৳45,200, up 8% from yesterday...",
      "toolCalls": [
        { "tool": "get_sales_summary", "input": { "date_range": "today" } }
      ],
      "createdAt": "..."
    }
  }
}
```
Exposing `toolCalls` in the response (even minimally) gives the frontend the option to show "what the AI checked" for transparency — Module 2's chat UI can use this for a small "sources" indicator if desired, but it's not required to render it in v1.

### 6.1 Streaming (optional, recommended if time permits)
If implementing streaming, use Server-Sent Events on a separate `POST /api/v1/ai/chat/stream` endpoint rather than changing the contract of the non-streaming one, so Module 2's frontend can fall back to the simple request/response version if streaming isn't ready yet. Document clearly which one is actually implemented so the frontend agent doesn't build against a streaming contract that doesn't exist.

---

## 7. Quick Prompts (configurable, not hardcoded in frontend)

Define in `prompts.py` as a simple list, returned via `GET /ai/quick-prompts`:
```python
QUICK_PROMPTS = [
    "What were today's total sales?",
    "Which ingredients are running low?",
    "How much should I restock tomorrow?",
    "What's my top selling item this week?",
    "How are my stores performing compared to each other?",
]
```
Keep this list short (4–6 items) and operational — these map directly to the tools in Section 5.

---

## 8. Conversation Memory Strategy

- Each `POST /ai/chat` call loads the last N messages (e.g. last 20, or trimmed to fit a token budget) from `ai_messages` for the given `conversationId`, in order, and passes them to LangChain as conversation history alongside the new user message.
- After the agent responds, persist both the user message and assistant message (with `toolCalls`/`toolResults` if present) to `ai_messages`, and bump `ai_conversations.updatedAt`.
- Auto-generate a conversation `title` from the first user message (simple truncation, or a cheap follow-up LLM call to summarize — truncation is fine for v1).

---

## 9. Guardrails & Error Handling

- If the LLM attempts to call a tool with a `businessId`/`storeId` it shouldn't have access to, the tool implementation rejects it server-side — this must never rely on the LLM "behaving" correctly, since prompt injection or model error is always possible.
- If a tool call fails (DB error, bad input), return a clear error to the agent so it can tell the user something went wrong, rather than the request silently failing.
- Rate-limit `/ai/chat` per user (reuse the Redis-based limiter pattern from Module 1's auth endpoints) to control OpenRouter API costs.
- Log token usage per request (store on the `ai_messages` document or a separate lightweight `ai_usage_logs` collection) so the business owner can be shown usage/cost data later if needed — not required to surface in UI for v1, but cheap to log now.

---

## 10. Build Order

1. Implement `ai/agent.py` with a minimal LangChain agent (no tools yet) wired to OpenRouter, confirm a basic chat round-trip works end-to-end through `POST /ai/chat`.
2. Build conversation persistence (`memory.py`, `ai_conversations`/`ai_messages` CRUD) and the conversation list/detail/delete endpoints.
3. Implement Sales Tools first (highest-value, most-requested per the product notes), wire into the agent, test against real seeded data.
4. Implement Inventory Tools, including the restock heuristic.
5. Implement Recipe, Employee, and Store tools.
6. Implement `GET /ai/quick-prompts`.
7. Add guardrails: rate limiting, businessId enforcement tests, tool error handling.
8. (Optional) Streaming endpoint.
9. Confirm with Module 2 that the AI Assistant page's chat UI (built earlier as a shell) now works against the real endpoints — this is the integration point where Module 2 and Module 4 must agree precisely on the `POST /ai/chat` request/response shape from Section 6.

**Final integration check across all four modules:** run a full scenario — log in via web (Module 2), record a sale via mobile (Module 3) while offline, reconnect and confirm it syncs (Module 3 → Module 1), confirm it shows up in the web dashboard's sales list and analytics (Module 2 → Module 1), then ask the AI Assistant "what were today's sales?" and confirm the figure matches exactly (Module 4 → Module 1 → Module 2's displayed number). Any mismatch means a module drifted from the shared contracts in these documents — fix the drift, don't paper over it in the UI.
