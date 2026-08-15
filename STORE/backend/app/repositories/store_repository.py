from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from app.repositories.base import BaseRepository


class StoreRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "stores")

    @property
    def collection(self):
        return self.db[self.collection_name]

    @staticmethod
    def _serialize(doc: dict[str, Any]) -> dict[str, Any]:
        payload = dict(doc)
        payload["id"] = str(payload.pop("_id"))
        return payload

    async def list(self, *, business_id: str) -> list[dict[str, Any]]:
        cursor = self.collection.find({"businessId": business_id}).sort("createdAt", -1)
        return [self._serialize(item) async for item in cursor]

    async def get(self, *, business_id: str, store_id: str) -> dict[str, Any] | None:
        try:
            object_id = ObjectId(store_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": object_id, "businessId": business_id})
        return self._serialize(doc) if doc else None

    async def create(self, *, business_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "businessId": business_id,
            "status": "CLOSED",
            "isActive": True,
            "createdAt": now,
            "updatedAt": now,
            **payload,
        }
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def update(self, *, business_id: str, store_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        try:
            object_id = ObjectId(store_id)
        except Exception:
            return None
        updates = {**payload, "updatedAt": datetime.now(timezone.utc)}
        await self.collection.update_one({"_id": object_id, "businessId": business_id}, {"$set": updates})
        doc = await self.collection.find_one({"_id": object_id, "businessId": business_id})
        return self._serialize(doc) if doc else None
