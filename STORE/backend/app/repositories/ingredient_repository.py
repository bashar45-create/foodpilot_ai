from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from bson import ObjectId

from app.repositories.base import BaseRepository


class IngredientRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "ingredients")

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

    async def list(self, *, business_id, category=None, low_stock=None):
        query = {"businessId": business_id}
        if category:
            query["category"] = category
        cursor = self.collection.find(query).sort("createdAt", -1)
        rows = [self._serialize(item) async for item in cursor]
        if low_stock is True:
            rows = [r for r in rows if (r.get("currentStock", 0) or 0) <= (r.get("minimumStock", 0) or 0)]
        elif low_stock is False:
            rows = [r for r in rows if (r.get("currentStock", 0) or 0) > (r.get("minimumStock", 0) or 0)]
        return rows

    async def get(self, *, business_id, ingredient_id):
        try:
            oid = ObjectId(ingredient_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def get_by_name(self, *, business_id, name):
        doc = await self.collection.find_one({"businessId": business_id, "name": name})
        return self._serialize(doc)

    async def create(self, *, business_id, payload):
        now = datetime.now(timezone.utc)
        doc = {"businessId": business_id, "currentStock": 0, "createdAt": now, "updatedAt": now}
        for k, v in payload.items():
            if k in {"currentStock", "minimumStock"}:
                doc[k] = v if v is not None else 0
            elif v is not None:
                doc[k] = v
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def update(self, *, business_id, ingredient_id, payload):
        try:
            oid = ObjectId(ingredient_id)
        except Exception:
            return None
        update = {k: v for k, v in payload.items() if v is not None}
        update["updatedAt"] = datetime.now(timezone.utc)
        await self.collection.update_one({"_id": oid, "businessId": business_id}, {"$set": update})
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def delete(self, *, business_id, ingredient_id):
        try:
            oid = ObjectId(ingredient_id)
        except Exception:
            return False
        result = await self.collection.delete_one({"_id": oid, "businessId": business_id})
        return result.deleted_count == 1

    async def low_stock(self, *, business_id):
        return await self.list(business_id=business_id, low_stock=True)

    # -------------------------------------------------------------------------
    # Pool (master pantry) atomic helpers
    # -------------------------------------------------------------------------
    # `ingredients.currentStock` is treated as a shared "pool" that any store
    # can draw from. These helpers do the atomic read-and-decrement/increment
    # so allocation/sale flows can rely on them without losing updates.

    async def decrement_pool(self, *, business_id: str, ingredient_id: str, amount: float, session=None):
        """Atomically decrement the master pool by `amount` if there's enough.

        Returns ``{"ok": True, "before": float, "after": float, "doc": {...}}`` on success.
        Returns ``{"ok": False, "reason": "insufficient_pool" | "not_found", "current": float|None, "doc": {...}|None}`` on failure.
        Pass ``session=...`` to participate in a Mongo transaction.
        """
        from bson import ObjectId as _Oid
        try:
            oid = _Oid(ingredient_id)
        except Exception:
            return {"ok": False, "reason": "not_found", "current": None, "doc": None}
        kwargs: Dict[str, Any] = {"return_document": True}
        if session is not None:
            kwargs["session"] = session
        result = await self.collection.find_one_and_update(
            {"_id": oid, "businessId": business_id, "currentStock": {"$gte": amount}},
            {"$inc": {"currentStock": -amount}, "$set": {"updatedAt": datetime.now(timezone.utc)}},
            **kwargs,
        )
        if result is None:
            find_kwargs: Dict[str, Any] = {}
            if session is not None:
                find_kwargs["session"] = session
            doc = await self.collection.find_one({"_id": oid, "businessId": business_id}, **find_kwargs)
            if not doc:
                return {"ok": False, "reason": "not_found", "current": None, "doc": None}
            return {
                "ok": False,
                "reason": "insufficient_pool",
                "current": float(doc.get("currentStock") or 0),
                "doc": self._serialize(doc),
            }
        before = float(result.get("currentStock") or 0) + amount  # post-$inc value is "after"
        return {
            "ok": True,
            "before": before,
            "after": float(result.get("currentStock") or 0),
            "doc": self._serialize(result),
        }

    async def increment_pool(self, *, business_id: str, ingredient_id: str, amount: float, session=None):
        """Atomically increment the master pool by `amount` (refund path)."""
        from bson import ObjectId as _Oid
        try:
            oid = _Oid(ingredient_id)
        except Exception:
            return {"ok": False, "reason": "not_found", "doc": None}
        kwargs: Dict[str, Any] = {"return_document": True}
        if session is not None:
            kwargs["session"] = session
        result = await self.collection.find_one_and_update(
            {"_id": oid, "businessId": business_id},
            {"$inc": {"currentStock": amount}, "$set": {"updatedAt": datetime.now(timezone.utc)}},
            **kwargs,
        )
        if not result:
            return {"ok": False, "reason": "not_found", "doc": None}
        return {
            "ok": True,
            "before": float(result.get("currentStock") or 0) - amount,
            "after": float(result.get("currentStock") or 0),
            "doc": self._serialize(result),
        }
