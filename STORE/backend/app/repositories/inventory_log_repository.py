from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.repositories.base import BaseRepository


class InventoryLogRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "inventory_logs")

    @property
    def collection(self):
        return self.db[self.collection_name]

    async def insert(self, *, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {**payload, "createdAt": now, "updatedAt": now}
        if "timestamp" not in doc:
            doc["timestamp"] = now.isoformat()
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def history(self, *, business_id: str, ingredient_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"businessId": business_id}
        # Some seeders/logs may have stored ObjectId; accept both forms.
        if all(c in "0123456789abcdefABCDEF" for c in ingredient_id) and len(ingredient_id) == 24:
            try:
                oid = ObjectId(ingredient_id)
            except Exception:
                oid = None
            if oid is not None:
                query["$or"] = [{"ingredientId": str(oid)}, {"ingredientId": oid}]
            else:
                query["ingredientId"] = ingredient_id
        else:
            query["ingredientId"] = ingredient_id
        cursor = self.collection.find(query).sort("createdAt", -1).limit(limit)
        return [self._serialize(doc) async for doc in cursor]

    @staticmethod
    def _serialize(doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not doc:
            return {}
        payload = dict(doc)
        if "_id" in payload:
            payload["id"] = str(payload.pop("_id"))
        return payload
