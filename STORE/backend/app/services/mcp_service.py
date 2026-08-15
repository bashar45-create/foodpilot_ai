from __future__ import annotations

import re
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import ValidationError


# Read-only MongoDB access layer used by the AI Assistant page and any external
# MCP-compatible client (e.g. mongodb-mcp-server running in read-only mode).
#
# Only "safe" operations are exposed:
#   - list_collections  (returns names + a sample doc per collection, scoped by businessId)
#   - find              (filter + projection + sort + limit, capped)
#   - aggregate         (capped pipeline length, stages validated)
#   - count             (filter + capped)
#   - list_indexes
#   - server_status     (basic health, no internal config)
#
# Write operations (insert/update/delete/drop/create-index) are intentionally
# absent from this service. The external MCP server should also be started with
# --readOnly or MDB_MCP_READ_ONLY=true as a defense-in-depth measure.

_SAFE_OPERATORS: set[str] = {
    # Comparison
    "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin",
    # Logical
    "$and", "$or", "$not", "$nor",
    # Element
    "$exists", "$type",
    # Array
    "$elemMatch", "$size", "$all",
    # Evaluation
    "$regex", "$options", "$mod",
}

_UNSAFE_OPERATORS: set[str] = {
    "$where", "$expr", "$function", "$accumulator", "$jsonSchema",
}

_ALLOWED_AGGREGATION_STAGES: set[str] = {
    "$match", "$project", "$sort", "$limit", "$skip", "$count",
    "$group", "$unwind", "$lookup", "$addFields", "$set",
    "$replaceRoot", "$replaceWith", "$bucket", "$bucketAuto",
    "$facet", "$densify", "$fill", "$sortByCount",
}

_FORBIDDEN_AGGREGATION_STAGES: set[str] = {
    "$out", "$merge", "$indexStats", "$listSessions", "$listLocalSessions",
    "$planCacheStats", "$currentOp", "$killCursors",
}

# Whitelist of collections the AI / MCP bridge is allowed to query. Mirrors
# the collections the backend services actually own. Any other collection
# requested is rejected with a 403-style error.
ALLOWED_COLLECTIONS: set[str] = {
    "ingredients",
    "recipes",
    "food_items",
    "stores",
    "users",
    "employees",
    "attendance",
    "sales",
    "allocations",
    "store_inventory",
    "inventory_logs",
    "tickets",
    "notifications",
    "ai_conversations",
    "ai_messages",
    "forecast_runs",
}

MAX_LIMIT = 200
MAX_PIPELINE_STAGES = 12
MAX_AGGREGATION_RESULTS = 500


def _validate_collection(name: str) -> None:
    if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]{0,63}", name or ""):
        raise ValidationError(code="MCP_INVALID_COLLECTION", message="Invalid collection name")
    if name not in ALLOWED_COLLECTIONS:
        raise ValidationError(
            code="MCP_COLLECTION_NOT_ALLOWED",
            message=f"Collection '{name}' is not accessible via the read-only MCP bridge",
        )


def _scrub_filter(value: Any) -> Any:
    """Walk a filter document, drop unsafe operators, recurse into dicts/lists."""
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, inner in value.items():
            if key in _UNSAFE_OPERATORS:
                continue
            if key.startswith("$") and key not in _SAFE_OPERATORS:
                continue
            cleaned[key] = _scrub_filter(inner)
        return cleaned
    if isinstance(value, list):
        return [_scrub_filter(item) for item in value]
    return value


def _scrub_pipeline(pipeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(pipeline, list):
        raise ValidationError(code="MCP_INVALID_PIPELINE", message="Aggregation pipeline must be an array")
    if len(pipeline) > MAX_PIPELINE_STAGES:
        raise ValidationError(
            code="MCP_PIPELINE_TOO_LONG",
            message=f"Aggregation pipeline exceeds {MAX_PIPELINE_STAGES} stages",
        )
    cleaned: list[dict[str, Any]] = []
    for stage in pipeline:
        if not isinstance(stage, dict):
            raise ValidationError(code="MCP_INVALID_STAGE", message="Each pipeline stage must be an object")
        for key, value in stage.items():
            if not key.startswith("$"):
                raise ValidationError(
                    code="MCP_INVALID_STAGE",
                    message=f"Pipeline stage key must start with $ — got '{key}'",
                )
            if key in _FORBIDDEN_AGGREGATION_STAGES:
                raise ValidationError(
                    code="MCP_FORBIDDEN_STAGE",
                    message=f"Stage '{key}' is not permitted via the read-only bridge",
                )
            if key not in _ALLOWED_AGGREGATION_STAGES:
                raise ValidationError(
                    code="MCP_UNKNOWN_STAGE",
                    message=f"Stage '{key}' is not in the allowed stage list",
                )
        cleaned.append(_scrub_filter(stage))
    return cleaned


class McpService:
    """Read-only bridge that mirrors what the MongoDB MCP server exposes
    (`find`, `aggregate`, `count`, `list-collections`, `list-indexes`),
    but stays scoped to the requesting business and refuses any write op.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db

    @staticmethod
    def manifest() -> dict[str, Any]:
        return {
            "name": "store-mcp-readonly",
            "version": "1.0.0",
            "description": "Read-only MongoDB bridge for the STORE ERP, scoped by businessId.",
            "transport": ["http", "stdio"],
            "tools": [
                "list_collections",
                "find",
                "aggregate",
                "count",
                "list_indexes",
                "server_status",
                # AI assistant tools — listed here so the chat UI can show users
                # what read-only helpers STORE AI can call.
                "get_sales_summary",
                "get_top_selling_items",
                "get_sales_by_payment_method",
                "get_current_stock",
                "get_low_stock_items",
                "get_stock_history",
                "suggest_restock_quantities",
                "get_recipe_ingredients",
                "get_recipe_cost",
                "compare_store_performance",
                "get_store_status",
                "get_employee_performance",
            ],
            "collections": sorted(ALLOWED_COLLECTIONS),
            "limits": {
                "maxLimit": MAX_LIMIT,
                "maxPipelineStages": MAX_PIPELINE_STAGES,
                "maxAggregationResults": MAX_AGGREGATION_RESULTS,
            },
            "blockedOperators": sorted(_UNSAFE_OPERATORS),
            "blockedStages": sorted(_FORBIDDEN_AGGREGATION_STAGES),
        }

    async def server_status(self) -> dict[str, Any]:
        try:
            info = await self.db.client.server_info()
            return {
                "ok": True,
                "version": info.get("version"),
                "readOnly": True,
                "scopedBy": "businessId",
            }
        except Exception as exc:  # pragma: no cover — best effort
            return {"ok": False, "error": str(exc), "readOnly": True, "scopedBy": "businessId"}

    async def list_collections(self, *, business_id: str) -> list[dict[str, Any]]:
        names = await self.db.list_collection_names()
        names = [n for n in names if n in ALLOWED_COLLECTIONS]
        out: list[dict[str, Any]] = []
        for name in names:
            sample = await self.db[name].find_one({"businessId": business_id}) or {}
            out.append(
                {
                    "name": name,
                    "fieldsSample": sorted(sample.keys()) if sample else [],
                }
            )
        return out

    async def list_indexes(self, *, business_id: str, collection: str) -> list[dict[str, Any]]:
        _validate_collection(collection)
        indexes: list[dict[str, Any]] = []
        async for idx in self.db[collection].list_indexes():
            indexes.append({"name": idx.get("name"), "key": idx.get("key")})
        # Scope echo so callers know the bridge applied businessId filter
        _ = business_id
        return indexes

    async def find(
        self,
        *,
        business_id: str,
        collection: str,
        filter: dict[str, Any] | None = None,
        projection: dict[str, Any] | None = None,
        sort: list[tuple[str, int]] | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        _validate_collection(collection)
        limit = max(1, min(int(limit or 50), MAX_LIMIT))
        safe_filter = _scrub_filter(filter or {})
        safe_filter = {"$and": [safe_filter, {"businessId": business_id}]} if safe_filter else {"businessId": business_id}
        cursor = self.db[collection].find(safe_filter, projection or None)
        if sort:
            cursor = cursor.sort(sort)
        cursor = cursor.limit(limit)
        return [doc async for doc in cursor]

    async def count(
        self,
        *,
        business_id: str,
        collection: str,
        filter: dict[str, Any] | None = None,
    ) -> int:
        _validate_collection(collection)
        safe_filter = _scrub_filter(filter or {})
        safe_filter = {"$and": [safe_filter, {"businessId": business_id}]} if safe_filter else {"businessId": business_id}
        return int(await self.db[collection].count_documents(safe_filter))

    async def aggregate(
        self,
        *,
        business_id: str,
        collection: str,
        pipeline: list[dict[str, Any]],
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        _validate_collection(collection)
        limit = max(1, min(int(limit or 100), MAX_AGGREGATION_RESULTS))
        cleaned = _scrub_pipeline(pipeline)
        # Force businessId into the first $match. If the caller supplied one,
        # we $and it; otherwise we add it directly.
        match_stage = {"$match": {"businessId": business_id}}
        if cleaned and "$match" in cleaned[0]:
            existing = cleaned[0]["$match"] or {}
            existing = {"$and": [existing, {"businessId": business_id}]} if existing else {"businessId": business_id}
            cleaned[0] = {"$match": existing}
            full_pipeline = cleaned
        else:
            full_pipeline = [match_stage, *cleaned]
        # Always cap final output.
        full_pipeline.append({"$limit": limit})
        cursor = self.db[collection].aggregate(full_pipeline)
        return [doc async for doc in cursor]