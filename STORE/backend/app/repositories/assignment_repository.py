from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.repositories.base import BaseRepository


class AssignmentRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "daily_assignments")

    @property
    def collection(self):
        return self.db[self.collection_name]

    @staticmethod
    def _serialize(doc):
        if not doc:
            return None
        payload = dict(doc)
        payload["id"] = str(payload.pop("_id"))
        return payload

    async def get_by_date(self, *, business_id, store_id, date):
        doc = await self.collection.find_one({"businessId": business_id, "storeId": store_id, "date": date})
        return self._serialize(doc)

    async def list_by_store(self, *, business_id, store_id, limit=30):
        cursor = self.collection.find({"businessId": business_id, "storeId": store_id}).sort("date", -1).limit(limit)
        return [self._serialize(d) async for d in cursor]

    async def upsert(self, *, business_id, store_id, date, allocations):
        now = datetime.now(timezone.utc)
        update = {
            "$set": {"allocations": allocations, "updatedAt": now},
            "$setOnInsert": {"businessId": business_id, "storeId": store_id, "date": date, "createdAt": now},
        }
        await self.collection.update_one({"businessId": business_id, "storeId": store_id, "date": date}, update, upsert=True)
        return await self.get_by_date(business_id=business_id, store_id=store_id, date=date)
