from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from app.repositories.base import BaseRepository


class NotificationRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "notifications")

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

    async def create(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {**payload, "createdAt": now, "read": False}
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def list_recent(self, *, business_id: str, store_id: str | None = None, limit: int = 50) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"businessId": business_id}
        if store_id:
            query["storeId"] = store_id
        cursor = self.collection.find(query).sort("createdAt", -1).limit(limit)
        return [self._serialize(d) async for d in cursor]

    async def mark_read(self, *, business_id: str, notification_id: str) -> Dict[str, Any]:
        from bson import ObjectId
        await self.collection.update_one(
            {"_id": ObjectId(notification_id), "businessId": business_id},
            {"$set": {"read": True}},
        )
        doc = await self.collection.find_one({"_id": ObjectId(notification_id)})
        return self._serialize(doc)
