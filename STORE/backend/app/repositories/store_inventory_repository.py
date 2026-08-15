from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId

from app.repositories.base import BaseRepository


class StoreInventoryRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "store_inventory")

    @property
    def collection(self):
        return self.db[self.collection_name]

    @staticmethod
    def _serialize(doc):
        if not doc:
            return None
        payload = dict(doc)
        if "_id" in payload:
            payload["id"] = str(payload.pop("_id"))
        return payload

    async def list_by_store(self, *, business_id, store_id):
        cursor = self.collection.find({"businessId": business_id, "storeId": store_id})
        return [self._serialize(d) async for d in cursor]

    async def get_one(self, *, business_id, store_id, ingredient_id):
        doc = await self.collection.find_one({"businessId": business_id, "storeId": store_id, "ingredientId": ingredient_id})
        return self._serialize(doc)

    async def upsert(self, *, business_id: str, store_id: str, ingredient_id: str, allocated: float | None = None, quantity: float | None = None, minimumStock: float | None = None) -> Dict[str, Any]:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        set_doc: Dict[str, Any] = {"businessId": business_id, "storeId": store_id, "ingredientId": ingredient_id, "updatedAt": now}
        if quantity is not None:
            set_doc["quantity"] = quantity
        if minimumStock is not None:
            set_doc["minimumStock"] = minimumStock
        if allocated is not None:
            set_doc["allocated"] = allocated
        await self.collection.update_one(
            {"businessId": business_id, "storeId": store_id, "ingredientId": ingredient_id},
            {"$set": set_doc, "$setOnInsert": {"createdAt": now}},
            upsert=True,
        )
        return await self.get_one(business_id=business_id, store_id=store_id, ingredient_id=ingredient_id)
        now = datetime.now(timezone.utc)
        update = {"$set": {"updatedAt": now}, "$setOnInsert": {"businessId": business_id, "storeId": store_id, "ingredientId": ingredient_id, "createdAt": now}}
        set_fields = update["$set"]
        if quantity is not None:
            set_fields["quantity"] = quantity
        if allocated is not None:
            set_fields["allocated"] = allocated
        await self.collection.update_one(
            {"businessId": business_id, "storeId": store_id, "ingredientId": ingredient_id},
            update,
            upsert=True,
        )
        return await self.get_one(business_id=business_id, store_id=store_id, ingredient_id=ingredient_id)

    async def atomic_decrement(self, *, business_id, store_id, ingredient_id, amount, session=None):
        """Atomically decrement ``quantity`` by ``amount`` only if there is enough stock.

        Returns:
          ``{"ok": True, "current": {...}}`` on success,
          ``{"ok": False, "reason": "insufficient_stock" | "no_stock_record", "current": ...}`` on failure.

        Pass ``session=...`` to participate in a Mongo transaction.
        """
        kwargs = {"return_document": True}
        if session is not None:
            kwargs["session"] = session
        result = await self.collection.find_one_and_update(
            {"businessId": business_id, "storeId": store_id, "ingredientId": ingredient_id, "quantity": {"$gte": amount}},
            {"$inc": {"quantity": -amount}, "$set": {"updatedAt": datetime.now(timezone.utc)}},
            **kwargs,
        )
        if result is None:
            find_kwargs: Dict[str, Any] = {}
            if session is not None:
                find_kwargs["session"] = session
            current = await self.collection.find_one(
                {"businessId": business_id, "storeId": store_id, "ingredientId": ingredient_id}, **find_kwargs
            )
            if current is None:
                return {"ok": False, "reason": "no_stock_record", "current": None}
            return {"ok": False, "reason": "insufficient_stock", "current": self._serialize(current)}
        return {"ok": True, "current": self._serialize(result)}

    async def atomic_increment(self, *, business_id, store_id, ingredient_id, amount, session=None):
        """Atomically increment ``quantity`` by ``amount``. Used when reversing an allocation.

        Creates the stock record if it doesn't exist. Returns the updated doc.
        """
        from datetime import datetime as _dt, timezone as _tz
        now = _dt.now(_tz.utc)
        kwargs: Dict[str, Any] = {"return_document": True, "upsert": True}
        if session is not None:
            kwargs["session"] = session
        result = await self.collection.find_one_and_update(
            {"businessId": business_id, "storeId": store_id, "ingredientId": ingredient_id},
            {
                "$inc": {"quantity": amount},
                "$set": {"updatedAt": now},
                "$setOnInsert": {
                    "businessId": business_id,
                    "storeId": store_id,
                    "ingredientId": ingredient_id,
                    "createdAt": now,
                },
            },
            **kwargs,
        )
        return self._serialize(result)
