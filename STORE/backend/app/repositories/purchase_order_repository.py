from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.repositories.base import BaseRepository


class PurchaseOrderRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "purchase_orders")

    @property
    def collection(self):
        return self.db[self.collection_name]

    async def insert(self, *, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {**payload, "createdAt": now, "updatedAt": now}
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def list_for_business(self, *, business_id: str, limit: int = 100):
        cursor = self.collection.find({"businessId": business_id}).sort("createdAt", -1).limit(limit)
        return [self._serialize(doc) async for doc in cursor]

    @staticmethod
    def _serialize(doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not doc:
            return {}
        payload = dict(doc)
        if "_id" in payload:
            payload["id"] = str(payload.pop("_id"))
        return payload