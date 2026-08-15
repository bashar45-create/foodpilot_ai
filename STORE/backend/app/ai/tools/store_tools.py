from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from langchain_core.tools import StructuredTool
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel


def _date_range_window(date_range: str) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    normalized = (date_range or "last_7_days").strip().lower()
    if normalized in {"today", "day"}:
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        return start, now
    if normalized in {"last_30_days", "30d", "month"}:
        return now - timedelta(days=30), now
    return now - timedelta(days=7), now


class CompareStoreArgs(BaseModel):
    date_range: str = "last_7_days"


class StoreStatusArgs(BaseModel):
    store_id: str | None = None


def build_store_tools(db: AsyncIOMotorDatabase, business_id: str) -> list[StructuredTool]:
    async def compare_store_performance(date_range: str = "last_7_days") -> dict[str, Any]:
        start, end = _date_range_window(date_range)
        rows = await (
            db["sales"]
            .aggregate(
                [
                    {
                        "$match": {
                            "businessId": business_id,
                            "createdAt": {"$gte": start, "$lte": end},
                            "status": {"$ne": "REFUNDED"},
                        }
                    },
                    {
                        "$group": {
                            "_id": "$storeId",
                            "revenue": {"$sum": {"$ifNull": ["$netRevenue", 0]}},
                            "profit": {"$sum": {"$ifNull": ["$grossProfit", 0]}},
                            "transactions": {"$sum": 1},
                        }
                    },
                    {"$sort": {"revenue": -1}},
                ]
            )
            .to_list(length=200)
        )
        stores = await db["stores"].find({"businessId": business_id}).to_list(length=500)
        store_name_map = {str(store.get("_id")): store.get("name", "Unknown Store") for store in stores}

        result = []
        for row in rows:
            store_id = row.get("_id")
            result.append(
                {
                    "storeId": store_id,
                    "storeName": store_name_map.get(str(store_id), "Unknown Store"),
                    "revenue": row.get("revenue", 0),
                    "profit": row.get("profit", 0),
                    "transactions": row.get("transactions", 0),
                }
            )

        return {"dateRange": date_range, "stores": result}

    async def get_store_status(store_id: str | None = None) -> dict[str, Any]:
        query: dict[str, Any] = {"businessId": business_id}
        if store_id:
            query["_id"] = {"$in": [store_id]}
        stores = await db["stores"].find(query).to_list(length=200)
        return {
            "stores": [
                {
                    "storeId": str(store.get("_id", "")),
                    "name": store.get("name", "Unknown Store"),
                    "status": store.get("status", "UNKNOWN"),
                    "isActive": store.get("isActive", True),
                }
                for store in stores
            ]
        }

    return [
        StructuredTool.from_function(
            coroutine=compare_store_performance,
            func=None,
            name="compare_store_performance",
            description="Compare store performance by revenue, profit, and transaction count.",
            args_schema=CompareStoreArgs,
        ),
        StructuredTool.from_function(
            coroutine=get_store_status,
            func=None,
            name="get_store_status",
            description="Get store open/close status and active flags.",
            args_schema=StoreStatusArgs,
        ),
    ]
