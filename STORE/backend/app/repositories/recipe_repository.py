from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId

from app.repositories.base import BaseRepository


class RecipeRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "recipes")

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

    async def list(self, *, business_id, status=None):
        query = {"businessId": business_id}
        if status:
            query["status"] = status
        cursor = self.collection.find(query).sort("createdAt", -1)
        return [self._serialize(d) async for d in cursor]

    async def get(self, *, business_id, recipe_id):
        try:
            oid = ObjectId(recipe_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def get_by_name(self, *, business_id, name):
        doc = await self.collection.find_one({"businessId": business_id, "name": name})
        return self._serialize(doc)

    async def get_active_for_food(self, *, business_id, food_id):
        """Find the active recipe for a food item.

        Looks up recipes whose ``foodItemId`` matches and status is ACTIVE
        (or, for older data, ``status`` is unset but ``isActive`` is True).
        Returns the serialized doc or None.
        """
        query = {
            "businessId": business_id,
            "foodItemId": food_id,
            "$or": [
                {"status": "ACTIVE"},
                {"status": "APPROVED"},
                {"status": {"$exists": False}, "isActive": True},
            ],
        }
        doc = await self.collection.find_one(query)
        return self._serialize(doc)

    async def create(self, *, business_id, payload):
        now = datetime.now(timezone.utc)
        doc = {"businessId": business_id, "status": "APPROVED", "versions": [], "images": [], "isAiGenerated": False, "createdAt": now, "updatedAt": now}
        for k, v in payload.items():
            doc[k] = v
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def update(self, *, business_id, recipe_id, payload):
        try:
            oid = ObjectId(recipe_id)
        except Exception:
            return None
        update = {k: v for k, v in payload.items() if v is not None}
        update["updatedAt"] = datetime.now(timezone.utc)
        await self.collection.update_one({"_id": oid, "businessId": business_id}, {"$set": update})
        return await self.get(business_id=business_id, recipe_id=recipe_id)

    async def delete(self, *, business_id, recipe_id):
        try:
            oid = ObjectId(recipe_id)
        except Exception:
            return False
        result = await self.collection.delete_one({"_id": oid, "businessId": business_id})
        return result.deleted_count == 1
