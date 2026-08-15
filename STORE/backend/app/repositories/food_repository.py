from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from app.repositories.base import BaseRepository


class FoodRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "food_items")

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

    async def list(self, *, business_id, category=None, store_id=None, status=None):
        query = {"businessId": business_id}
        if category:
            query["category"] = category
        if status:
            query["status"] = status
        if store_id:
            query["assignedStores"] = store_id
        cursor = self.collection.find(query).sort("createdAt", -1)
        return [self._serialize(d) async for d in cursor]

    async def get(self, *, business_id, food_id):
        try:
            oid = ObjectId(food_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def find_by_recipe(self, *, business_id, recipe_id):
        cursor = self.collection.find({"businessId": business_id, "recipeId": recipe_id})
        return [self._serialize(d) async for d in cursor]

    async def create(self, *, business_id, payload):
        now = datetime.now(timezone.utc)
        doc = {"businessId": business_id, "cost": 0, "estimatedProfit": 0, "status": "ACTIVE", "assignedStores": [], "createdAt": now, "updatedAt": now}
        for k, v in payload.items():
            doc[k] = v
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def update(self, *, business_id, food_id, payload):
        try:
            oid = ObjectId(food_id)
        except Exception:
            return None
        update = {k: v for k, v in payload.items() if v is not None}
        update["updatedAt"] = datetime.now(timezone.utc)
        await self.collection.update_one({"_id": oid, "businessId": business_id}, {"$set": update})
        return await self.get(business_id=business_id, food_id=food_id)

    async def delete(self, *, business_id, food_id):
        try:
            oid = ObjectId(food_id)
        except Exception:
            return False
        result = await self.collection.delete_one({"_id": oid, "businessId": business_id})
        return result.deleted_count == 1
