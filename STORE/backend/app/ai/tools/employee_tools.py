from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from langchain_core.tools import StructuredTool
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field


def _date_range_window(date_range: str) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    normalized = (date_range or "last_7_days").strip().lower()
    if normalized in {"today", "day"}:
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        return start, now
    if normalized in {"last_30_days", "30d", "month"}:
        return now - timedelta(days=30), now
    return now - timedelta(days=7), now


class EmployeePerformanceArgs(BaseModel):
    employee_name_or_id: str
    date_range: str = Field(default="last_7_days")


def build_employee_tools(
    db: AsyncIOMotorDatabase,
    *,
    business_id: str,
    current_user_id: str,
    current_user_role: str | None,
) -> list[StructuredTool]:
    async def get_employee_performance(employee_name_or_id: str, date_range: str = "last_7_days") -> dict[str, Any]:
        target_user = await db["users"].find_one(
            {
                "businessId": business_id,
                "$or": [
                    {"_id": employee_name_or_id},
                    {"fullName": {"$regex": employee_name_or_id, "$options": "i"}},
                    {"name": {"$regex": employee_name_or_id, "$options": "i"}},
                    {"email": {"$regex": employee_name_or_id, "$options": "i"}},
                ],
            }
        )
        if not target_user:
            return {"found": False, "employee": employee_name_or_id}

        target_user_id = str(target_user.get("_id", ""))
        if (current_user_role or "").upper() == "WORKER" and target_user_id != current_user_id:
            return {
                "found": False,
                "error": "WORKER_ROLE_RESTRICTED",
                "message": "Workers can only access their own performance data.",
            }

        start, end = _date_range_window(date_range)
        sales = await (
            db["sales"]
            .aggregate(
                [
                    {
                        "$match": {
                            "businessId": business_id,
                            "createdBy": {"$in": [target_user_id, target_user.get("_id")]},
                            "createdAt": {"$gte": start, "$lte": end},
                            "status": {"$ne": "REFUNDED"},
                        }
                    },
                    {
                        "$group": {
                            "_id": None,
                            "transactions": {"$sum": 1},
                            "revenue": {"$sum": {"$ifNull": ["$netRevenue", 0]}},
                            "profit": {"$sum": {"$ifNull": ["$grossProfit", 0]}},
                        }
                    },
                ]
            )
            .to_list(length=1)
        )
        totals = sales[0] if sales else {"transactions": 0, "revenue": 0, "profit": 0}
        totals.pop("_id", None)
        return {
            "found": True,
            "employeeId": target_user_id,
            "employee": target_user.get("fullName") or target_user.get("name") or target_user.get("email"),
            "dateRange": date_range,
            "from": start,
            "to": end,
            **totals,
        }

    return [
        StructuredTool.from_function(
            coroutine=get_employee_performance,
            func=None,
            name="get_employee_performance",
            description="Get employee sales performance summary for a date range.",
            args_schema=EmployeePerformanceArgs,
        )
    ]
