from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from langchain_core.tools import StructuredTool
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _date_window(date_range: str | None) -> tuple[datetime, datetime]:
    now = _utcnow()
    normalized = (date_range or "last_7_days").strip().lower()
    if normalized in {"today", "day"}:
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        return start, now
    if normalized in {"last_30_days", "30d", "month"}:
        return now - timedelta(days=30), now
    return now - timedelta(days=7), now


def _ingredient_match(business_id: str, store_id: str | None = None) -> dict[str, Any]:
    match: dict[str, Any] = {"businessId": business_id}
    if store_id:
        match["storeId"] = store_id
    return match


class CurrentStockArgs(BaseModel):
    ingredient_name: str | None = None
    store_id: str | None = None


class LowStockArgs(BaseModel):
    store_id: str | None = None


class StockHistoryArgs(BaseModel):
    ingredient_name: str
    date_range: str = Field(default="last_7_days")
    store_id: str | None = None


class RestockArgs(BaseModel):
    store_id: str | None = None
    days_ahead: int = Field(default=1, ge=1, le=14)


def build_inventory_tools(db: AsyncIOMotorDatabase, business_id: str) -> list[StructuredTool]:
    async def get_current_stock(ingredient_name: str | None = None, store_id: str | None = None) -> dict[str, Any]:
        query = _ingredient_match(business_id, store_id)
        if ingredient_name:
            query["name"] = {"$regex": ingredient_name, "$options": "i"}
        cursor = db["ingredients"].find(query).limit(200)
        rows = await cursor.to_list(length=200)
        items = []
        for row in rows:
            current_stock = float(row.get("currentStock", 0) or 0)
            minimum_stock = float(row.get("minimumStock", 0) or 0)
            items.append(
                {
                    "ingredientId": str(row.get("_id", "")),
                    "name": row.get("name", "Unknown"),
                    "currentStock": current_stock,
                    "minimumStock": minimum_stock,
                    "isLow": current_stock <= minimum_stock,
                    "unit": row.get("unit"),
                    "storeId": row.get("storeId"),
                }
            )
        return {"items": items, "count": len(items)}

    async def get_low_stock_items(store_id: str | None = None) -> dict[str, Any]:
        query = {
            **_ingredient_match(business_id, store_id),
            "$expr": {"$lte": [{"$ifNull": ["$currentStock", 0]}, {"$ifNull": ["$minimumStock", 0]}]},
        }
        rows = await db["ingredients"].find(query).limit(200).to_list(length=200)
        return {
            "items": [
                {
                    "ingredientId": str(row.get("_id", "")),
                    "name": row.get("name", "Unknown"),
                    "currentStock": float(row.get("currentStock", 0) or 0),
                    "minimumStock": float(row.get("minimumStock", 0) or 0),
                    "unit": row.get("unit"),
                    "storeId": row.get("storeId"),
                }
                for row in rows
            ]
        }

    async def get_stock_history(ingredient_name: str, date_range: str = "last_7_days", store_id: str | None = None) -> dict[str, Any]:
        start, end = _date_window(date_range)
        ingredient = await db["ingredients"].find_one(
            {
                **_ingredient_match(business_id, store_id),
                "name": {"$regex": ingredient_name, "$options": "i"},
            }
        )
        if not ingredient:
            return {"ingredient": ingredient_name, "entries": []}
        ingredient_id = str(ingredient.get("_id"))
        logs = await (
            db["inventory_logs"]
            .find(
                {
                    "businessId": business_id,
                    "ingredientId": {"$in": [ingredient_id, ingredient.get("_id")]},
                    "createdAt": {"$gte": start, "$lte": end},
                }
            )
            .sort("createdAt", -1)
            .limit(100)
            .to_list(length=100)
        )
        return {
            "ingredient": ingredient.get("name"),
            "dateRange": date_range,
            "entries": [
                {
                    "id": str(entry.get("_id", "")),
                    "action": entry.get("action"),
                    "quantity": float(entry.get("quantity", 0) or 0),
                    "storeId": entry.get("storeId"),
                    "createdAt": entry.get("createdAt"),
                }
                for entry in logs
            ],
        }

    async def suggest_restock_quantities(store_id: str | None = None, days_ahead: int = 1) -> dict[str, Any]:
        trailing_days = 7
        end = _utcnow()
        start = end - timedelta(days=trailing_days)
        logs_match: dict[str, Any] = {
            "businessId": business_id,
            "createdAt": {"$gte": start, "$lte": end},
            "action": {"$in": ["SALE", "ALLOCATION"]},
        }
        if store_id:
            logs_match["storeId"] = store_id

        consumption_rows = await (
            db["inventory_logs"]
            .aggregate(
                [
                    {"$match": logs_match},
                    {
                        "$group": {
                            "_id": "$ingredientId",
                            "totalConsumed": {"$sum": {"$abs": {"$ifNull": ["$quantity", 0]}}},
                        }
                    },
                ]
            )
            .to_list(length=500)
        )
        consumption_map = {str(row.get("_id")): float(row.get("totalConsumed", 0) or 0) for row in consumption_rows}

        ingredient_query = _ingredient_match(business_id, store_id)
        ingredients = await db["ingredients"].find(ingredient_query).limit(500).to_list(length=500)
        suggestions: list[dict[str, Any]] = []
        for ingredient in ingredients:
            ingredient_id = str(ingredient.get("_id"))
            total_consumed = consumption_map.get(ingredient_id, 0)
            avg_daily_use = total_consumed / trailing_days
            projected = avg_daily_use * days_ahead
            current_stock = float(ingredient.get("currentStock", 0) or 0)
            minimum_stock = float(ingredient.get("minimumStock", 0) or 0)
            maximum_stock = float(ingredient.get("maximumStock", 0) or 0)

            raw_suggestion = max((minimum_stock + projected) - current_stock, 0)
            max_delta = max(maximum_stock - current_stock, 0) if maximum_stock > 0 else raw_suggestion
            suggested_quantity = min(raw_suggestion, max_delta) if max_delta > 0 else raw_suggestion

            if suggested_quantity <= 0:
                continue
            suggestions.append(
                {
                    "ingredientId": ingredient_id,
                    "name": ingredient.get("name", "Unknown"),
                    "currentStock": current_stock,
                    "minimumStock": minimum_stock,
                    "maximumStock": maximum_stock,
                    "avgDailyUse": round(avg_daily_use, 3),
                    "projectedUse": round(projected, 3),
                    "suggestedQuantity": round(suggested_quantity, 3),
                    "unit": ingredient.get("unit"),
                    "heuristic": "trailing_7_day_average",
                }
            )

        suggestions.sort(key=lambda item: item["suggestedQuantity"], reverse=True)
        return {
            "storeId": store_id,
            "daysAhead": days_ahead,
            "method": "Based on trailing 7-day average consumption from inventory logs.",
            "items": suggestions,
        }

    return [
        StructuredTool.from_function(
            coroutine=get_current_stock,
            func=None,
            name="get_current_stock",
            description="Get current ingredient stock and low stock flags.",
            args_schema=CurrentStockArgs,
        ),
        StructuredTool.from_function(
            coroutine=get_low_stock_items,
            func=None,
            name="get_low_stock_items",
            description="Get low-stock ingredients where current stock is below or equal to minimum stock.",
            args_schema=LowStockArgs,
        ),
        StructuredTool.from_function(
            coroutine=get_stock_history,
            func=None,
            name="get_stock_history",
            description="Get stock ledger history for one ingredient.",
            args_schema=StockHistoryArgs,
        ),
        StructuredTool.from_function(
            coroutine=suggest_restock_quantities,
            func=None,
            name="suggest_restock_quantities",
            description="Suggest restock quantities using trailing 7-day average consumption.",
            args_schema=RestockArgs,
        ),
    ]
