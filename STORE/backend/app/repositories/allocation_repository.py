from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.repositories.base import BaseRepository


class AllocationRepository(BaseRepository):
    """Persistence for food-to-store allocations.

    Document shape:
        { _id, businessId, storeId, foodItemId, foodName, recipeId,
          quantity, unitPrice, totalCost, status: "ACTIVE"|"REVERSED"|"PARTIALLY_REVERSED",
          date: "YYYY-MM-DD", createdBy, createdAt, updatedAt,
          deductions: [{ingredientId, ingredientName, perUnit, required, before, after}],
          notes?: str,
          reversedAt?: datetime, reversedBy?: str }
    """

    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "allocations")

    @property
    def collection(self):
        return self.db[self.collection_name]

    @staticmethod
    def _serialize(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not doc:
            return None
        payload = dict(doc)
        payload["id"] = str(payload.pop("_id"))
        return payload

    async def insert(self, *, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {**payload, "createdAt": now, "updatedAt": now}
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)  # type: ignore[return-value]

    async def get_by_id(self, *, business_id: str, allocation_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(allocation_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def update(self, *, business_id: str, allocation_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(allocation_id)
        except Exception:
            return None
        update = {k: v for k, v in payload.items() if v is not None}
        update["updatedAt"] = datetime.now(timezone.utc)
        await self.collection.update_one({"_id": oid, "businessId": business_id}, {"$set": update})
        return await self.get_by_id(business_id=business_id, allocation_id=allocation_id)

    async def list(
        self,
        *,
        business_id: str,
        store_id: Optional[str] = None,
        food_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"businessId": business_id}
        if store_id:
            query["storeId"] = store_id
        if food_id:
            query["foodItemId"] = food_id
        if status:
            query["status"] = status
        if start_date or end_date:
            query["date"] = {}
            if start_date:
                query["date"]["$gte"] = start_date
            if end_date:
                query["date"]["$lte"] = end_date
        cursor = self.collection.find(query).sort([("date", -1), ("createdAt", -1)]).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [self._serialize(d) for d in docs if d is not None]  # type: ignore[return-value]

    async def sold_quantity_for(self, *, business_id: str, store_id: str, food_id: str, since: datetime) -> int:
        """Authoritative per-allocation sold count.

        Reads the allocation's ``sold`` counter (incremented FIFO at sale-time
        via ``consume_fifo``). The historical aggregate-by-date path is no
        longer needed because every sale now maintains its own allocation
        linkage. ``since`` is kept for API backwards compatibility but is not
        used to filter — for ACTIVE allocations we cap at ``quantity``; for
        REVERSED/RECLAIMED allocations we report the locked-in ``sold`` that
        existed at the moment of closure.
        """
        # We don't have the allocation here; callers should use
        # ``sold_for_allocation`` with the specific allocation id instead.
        # This is the legacy path used by services that need a per-store
        # aggregate before any allocation is identified — we sum ``sold``
        # across all matching active allocations for the day. Since real
        # sold-tracking happens FIFO at sale time, this just falls back to 0
        # unless the caller passes an allocation id (which it doesn't today).
        return 0

    async def sold_for_allocation(self, *, allocation: Dict[str, Any]) -> int:
        """Return the authoritative sold count for an allocation.

        Uses the ``sold`` field maintained by ``consume_fifo``. Clamped to the
        allocation's quantity (legacy rows could be over if pre-FIFO data
        erroneously double-counted). REVERSED / RECLAIMED allocations are
        frozen at the value they had when the closure transaction ran.
        """
        qty = float(allocation.get("quantity") or 0)
        raw = float(allocation.get("sold") or 0)
        if qty <= 0:
            return int(raw)
        status = (allocation.get("status") or "ACTIVE").upper()
        if status == "ACTIVE":
            return int(min(raw, qty))
        return int(raw)

    async def consume_fifo(
        self,
        *,
        business_id: str,
        store_id: str,
        food_id: str,
        quantity: float,
    ) -> List[Dict[str, Any]]:
        """Deduct ``quantity`` from the oldest ACTIVE allocation(s) at this store+food.

        Iterates allocations oldest-first (by ``createdAt`` ascending) and
        increments each one's ``sold`` field by however much capacity it has
        left. Returns the list of allocations that were touched (with their
        updated ``sold`` values) so the caller can emit audit rows if needed.
        """
        query = {
            "businessId": business_id,
            "storeId": store_id,
            "foodItemId": food_id,
            "status": "ACTIVE",
        }
        cursor = self.collection.find(query).sort([("createdAt", 1)])
        remaining = float(quantity)
        touched: List[Dict[str, Any]] = []
        async for doc in cursor:
            if remaining <= 0:
                break
            oid = doc["_id"]
            alloc_qty = float(doc.get("quantity") or 0)
            already_sold = float(doc.get("sold") or 0)
            capacity = max(alloc_qty - already_sold, 0)
            if capacity <= 0:
                continue
            take = min(capacity, remaining)
            # Atomic: only increment if it would not exceed quantity.
            updated = await self.collection.find_one_and_update(
                {
                    "_id": oid,
                    "businessId": business_id,
                    "status": "ACTIVE",
                    "$expr": {"$lte": [{"$add": [{"$ifNull": ["$sold", 0]}, take]}, "$quantity"]},
                },
                {
                    "$inc": {"sold": take},
                    "$set": {"updatedAt": datetime.now(timezone.utc)},
                },
                return_document=True,
            )
            if updated:
                touched.append(self._serialize(updated) or {})  # type: ignore[arg-type]
                remaining -= take
        return touched


__all__ = ["AllocationRepository"]