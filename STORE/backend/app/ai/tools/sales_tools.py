from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from langchain_core.tools import StructuredTool
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_date_range(date_range: str | None) -> tuple[datetime, datetime]:
    now = _utcnow()
    end = now
    normalized = (date_range or "today").strip().lower()
    if normalized in {"today", "day"}:
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        return start, end
    if normalized in {"yesterday"}:
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=1)
        return start, start + timedelta(days=1)
    if normalized in {"this_week", "week"}:
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=now.weekday())
        return start, end
    if normalized in {"last_7_days", "7d"}:
        return now - timedelta(days=7), end
    if normalized in {"last_30_days", "30d", "month"}:
        return now - timedelta(days=30), end
    return now - timedelta(days=7), end


def _sales_match(business_id: str, start: datetime, end: datetime, store_id: str | None = None) -> dict[str, Any]:
    match: dict[str, Any] = {
        "businessId": business_id,
        "createdAt": {"$gte": start, "$lte": end},
        "status": {"$ne": "REFUNDED"},
    }
    if store_id:
        match["storeId"] = store_id
    return match


class SalesSummaryArgs(BaseModel):
    date_range: str = Field(default="today", description="today, yesterday, this_week, last_7_days, last_30_days")
    store_id: str | None = Field(default=None)


class TopItemsArgs(BaseModel):
    date_range: str = Field(default="this_week")
    store_id: str | None = Field(default=None)
    limit: int = Field(default=5, ge=1, le=20)


class PaymentMethodArgs(BaseModel):
    date_range: str = Field(default="today")
    store_id: str | None = Field(default=None)


def build_sales_tools(db: AsyncIOMotorDatabase, business_id: str) -> list[StructuredTool]:
    async def get_sales_summary(date_range: str = "today", store_id: str | None = None) -> dict[str, Any]:
        start, end = _parse_date_range(date_range)
        pipeline = [
            {"$match": _sales_match(business_id, start, end, store_id)},
            {
                "$group": {
                    "_id": None,
                    "revenue": {"$sum": {"$ifNull": ["$netRevenue", 0]}},
                    "profit": {"$sum": {"$ifNull": ["$grossProfit", 0]}},
                    "transactions": {"$sum": 1},
                }
            },
        ]
        rows = await db["sales"].aggregate(pipeline).to_list(length=1)
        summary = rows[0] if rows else {"revenue": 0, "profit": 0, "transactions": 0}
        summary.pop("_id", None)
        return {
            "dateRange": date_range,
            "storeId": store_id,
            "from": start,
            "to": end,
            **summary,
        }

    async def get_top_selling_items(date_range: str = "this_week", store_id: str | None = None, limit: int = 5) -> dict[str, Any]:
        start, end = _parse_date_range(date_range)
        pipeline = [
            {"$match": _sales_match(business_id, start, end, store_id)},
            {"$unwind": "$items"},
            {
                "$group": {
                    "_id": "$items.foodItemId",
                    "quantity": {"$sum": {"$ifNull": ["$items.quantity", 0]}},
                    "revenue": {
                        "$sum": {
                            "$multiply": [
                                {"$ifNull": ["$items.quantity", 0]},
                                {"$ifNull": ["$items.unitPrice", 0]},
                            ]
                        }
                    },
                }
            },
            {"$sort": {"quantity": -1}},
            {"$limit": limit},
        ]
        rows = await db["sales"].aggregate(pipeline).to_list(length=limit)
        return {
            "dateRange": date_range,
            "storeId": store_id,
            "items": [
                {
                    "foodItemId": row.get("_id"),
                    "quantity": row.get("quantity", 0),
                    "revenue": row.get("revenue", 0),
                }
                for row in rows
            ],
        }

    async def get_sales_by_payment_method(date_range: str = "today", store_id: str | None = None) -> dict[str, Any]:
        start, end = _parse_date_range(date_range)
        pipeline = [
            {"$match": _sales_match(business_id, start, end, store_id)},
            {
                "$group": {
                    "_id": "$paymentMethod",
                    "count": {"$sum": 1},
                    "revenue": {"$sum": {"$ifNull": ["$netRevenue", 0]}},
                }
            },
            {"$sort": {"revenue": -1}},
        ]
        rows = await db["sales"].aggregate(pipeline).to_list(length=50)
        return {
            "dateRange": date_range,
            "storeId": store_id,
            "methods": [
                {
                    "paymentMethod": row.get("_id") or "UNKNOWN",
                    "count": row.get("count", 0),
                    "revenue": row.get("revenue", 0),
                }
                for row in rows
            ],
        }

    return [
        StructuredTool.from_function(
            coroutine=get_sales_summary,
            func=None,
            name="get_sales_summary",
            description="Get sales revenue, profit, and transactions for a date range.",
            args_schema=SalesSummaryArgs,
        ),
        StructuredTool.from_function(
            coroutine=get_top_selling_items,
            func=None,
            name="get_top_selling_items",
            description="Get top selling food items by quantity and revenue.",
            args_schema=TopItemsArgs,
        ),
        StructuredTool.from_function(
            coroutine=get_sales_by_payment_method,
            func=None,
            name="get_sales_by_payment_method",
            description="Break down sales by payment method.",
            args_schema=PaymentMethodArgs,
        ),
    ]
