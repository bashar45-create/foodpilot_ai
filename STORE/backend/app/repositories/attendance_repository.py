from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from bson import ObjectId

from app.repositories.base import BaseRepository


class AttendanceRepository(BaseRepository):
    """Persistence for daily attendance clock-in / clock-out records.

    Document shape:
        {
            "_id": ObjectId,
            "businessId": str,
            "userId": str,
            "storeId": str | None,
            "date": "YYYY-MM-DD",
            "status": "PRESENT" | "LATE" | "ABSENT" | "LEAVE",
            "clockIn": datetime | None,
            "clockOut": datetime | None,
            "note": str | None,
            "createdAt": datetime,
            "updatedAt": datetime,
        }
    """

    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "attendance")

    @property
    def collection(self):
        return self.db[self.collection_name]

    @staticmethod
    def _serialize(doc: Dict[str, Any] | None) -> Dict[str, Any] | None:
        if not doc:
            return None
        payload = dict(doc)
        payload["id"] = str(payload.pop("_id"))
        return payload

    async def get_for_day(self, *, business_id: str, user_id: str, date: str) -> Dict[str, Any] | None:
        doc = await self.collection.find_one(
            {"businessId": business_id, "userId": user_id, "date": date}
        )
        return self._serialize(doc)

    async def upsert_clock_in(
        self,
        *,
        business_id: str,
        user_id: str,
        store_id: str | None,
        date: str,
        clock_in: datetime,
        status: str = "PRESENT",
    ) -> Dict[str, Any]:
        existing = await self.collection.find_one(
            {"businessId": business_id, "userId": user_id, "date": date}
        )
        if existing:
            await self.collection.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "clockIn": clock_in,
                        "status": status,
                        "storeId": store_id,
                        "updatedAt": clock_in,
                    }
                },
            )
            doc = await self.collection.find_one({"_id": existing["_id"]})
        else:
            doc = {
                "businessId": business_id,
                "userId": user_id,
                "storeId": store_id,
                "date": date,
                "status": status,
                "clockIn": clock_in,
                "clockOut": None,
                "note": None,
                "createdAt": clock_in,
                "updatedAt": clock_in,
            }
            result = await self.collection.insert_one(doc)
            doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def set_clock_out(
        self,
        *,
        business_id: str,
        user_id: str,
        date: str,
        clock_out: datetime,
    ) -> Dict[str, Any] | None:
        existing = await self.collection.find_one(
            {"businessId": business_id, "userId": user_id, "date": date}
        )
        if not existing:
            return None
        await self.collection.update_one(
            {"_id": existing["_id"]},
            {"$set": {"clockOut": clock_out, "updatedAt": clock_out}},
        )
        doc = await self.collection.find_one({"_id": existing["_id"]})
        return self._serialize(doc)

    async def mark_status(
        self,
        *,
        business_id: str,
        user_id: str,
        date: str,
        status: str,
        store_id: str | None = None,
        note: str | None = None,
    ) -> Dict[str, Any]:
        """Admin override — set explicit status (PRESENT/LATE/ABSENT/LEAVE) for a date."""
        now = datetime.now(timezone.utc)
        existing = await self.collection.find_one(
            {"businessId": business_id, "userId": user_id, "date": date}
        )
        if existing:
            update: Dict[str, Any] = {"status": status, "updatedAt": now}
            if store_id is not None:
                update["storeId"] = store_id
            if note is not None:
                update["note"] = note
            await self.collection.update_one({"_id": existing["_id"]}, {"$set": update})
            doc = await self.collection.find_one({"_id": existing["_id"]})
        else:
            doc = {
                "businessId": business_id,
                "userId": user_id,
                "storeId": store_id,
                "date": date,
                "status": status,
                "clockIn": None,
                "clockOut": None,
                "note": note,
                "createdAt": now,
                "updatedAt": now,
            }
            result = await self.collection.insert_one(doc)
            doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def list_for_user(
        self,
        *,
        business_id: str,
        user_id: str,
        start_date: str,
        end_date: str,
    ) -> List[Dict[str, Any]]:
        cursor = (
            self.collection.find(
                {
                    "businessId": business_id,
                    "userId": user_id,
                    "date": {"$gte": start_date, "$lte": end_date},
                }
            )
            .sort("date", 1)
        )
        return [self._serialize(d) async for d in cursor]

    async def list_overview(
        self,
        *,
        business_id: str,
        start_date: str,
        end_date: str,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Return all attendance records in the range, grouped by user."""
        cursor = self.collection.find(
            {
                "businessId": business_id,
                "date": {"$gte": start_date, "$lte": end_date},
            }
        )
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        async for doc in cursor:
            serialized = self._serialize(doc)
            if serialized is None:
                continue
            grouped.setdefault(serialized["userId"], []).append(serialized)
        for user_id in grouped:
            grouped[user_id].sort(key=lambda row: row.get("date", ""))
        return grouped


__all__ = ["AttendanceRepository"]