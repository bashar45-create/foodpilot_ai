# Contract: SyncEvent.entity → Client Query Key Mapping

Defines how a client (web or mobile) translates an incoming `SyncEvent.entity` value into the TanStack Query key(s) it must invalidate/update. Query key factories referenced below already exist in `frontend/src/api/queryKeys.ts`; mobile must define an equivalent module (or a shared one — see `plan.md` Structure Decision) with matching entity names.

| `SyncEvent.entity` | Web query keys invalidated | Notes |
|---|---|---|
| `storeInventory` | `storeInventoryKeys.list(storeId)`, `storeInventoryKeys.lowStock(storeId)` | `storeId` taken from `event.storeId`. |
| `inventory` | `inventoryKeys.list()`, `inventoryKeys.detail(recordId)`, `inventoryKeys.lowStock()` | Business-wide ingredient catalog, not store-scoped. |
| `sale` | `saleKeys.list(storeId)`, `saleKeys.detail(recordId)`, `analyticsKeys.dashboard(storeId)`, `analyticsKeys.revenue(...)` (all active variants) | Sales changes also invalidate dependent analytics views since they're derived data. |
| `recipe` | `recipeKeys.list()`, `recipeKeys.detail(recordId)`, `recipeKeys.cost(recordId)` | |
| `attendance` | (attendance query keys — module TBD at task-breakdown time; not yet present in `queryKeys.ts`) | Must be added alongside the attendance sync hook. |
| `ticket` | (ticket query keys — module TBD at task-breakdown time; not yet present in `queryKeys.ts`) | Must be added alongside the ticket sync hook. |
| `store` | `storeKeys.list()`, `storeKeys.detail(recordId)` | |
| `allocation` | `allocationKeys.all`, `allocationKeys.list(...)`, `allocationKeys.detail(recordId)`, `allocationKeys.storeSummary(storeId, ...)` | |
| `assignment` | `assignmentKeys.daily(storeId, date)`, `assignmentKeys.recent(storeId)` | |
| `food` | `foodKeys.list()`, `foodKeys.detail(recordId)` | |
| `user` | `userKeys.list()`, `userKeys.detail(recordId)` | |
| `forecast` | `forecastKeys.daily(...)`, `forecastKeys.projected(...)` | Only if/when forecasts become directly editable (see `data-model.md` note). |

## Resolution rule

The client-side event handler is a single function, `resolveInvalidations(event: SyncEvent): QueryKey[]`, implemented once and shared by both the web sync hook and the mobile sync hook (structure permitting — see `plan.md`). It is a pure lookup/derivation function with no side effects, making it straightforward to unit test against this table directly.

## Deletion handling

For `action === "deleted"`, in addition to invalidating list-level keys, the client MUST remove any cached `detail(recordId)` entry via `queryClient.removeQueries` (not just invalidate) so that a currently-open detail view for a deleted record stops rendering stale data and can redirect/show a "no longer available" state — this satisfies the spec's edge case on viewing a deleted record.
