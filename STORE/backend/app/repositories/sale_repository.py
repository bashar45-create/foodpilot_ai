from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.repositories.base import BaseRepository


class SaleRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "sales")

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

    async def list(
        self,
        *,
        business_id: str,
        store_id: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"businessId": business_id}
        if store_id:
            query["storeId"] = store_id
        if start or end:
            query["createdAt"] = {}
            if start:
                query["createdAt"]["$gte"] = start
            if end:
                query["createdAt"]["$lte"] = end
        cursor = self.collection.find(query).sort("createdAt", -1).limit(limit)
        return [self._serialize(d) async for d in cursor]

    async def get(self, *, business_id: str, sale_id: str) -> Dict[str, Any]:
        from bson import ObjectId

        doc = await self.collection.find_one({"_id": ObjectId(sale_id), "businessId": business_id})
        return self._serialize(doc)

    async def create(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {**payload, "createdAt": now, "updatedAt": now}
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def count_for_day(self, *, business_id: str, store_id: str, day_start: datetime, day_end: datetime) -> int:
        return await self.collection.count_documents({
            "businessId": business_id,
            "storeId": store_id,
            "createdAt": {"$gte": day_start, "$lte": day_end},
        })

    async def aggregate_quantity(self, *, business_id: str, since: datetime) -> List[Dict[str, Any]]:
        pipeline = [
            {"$match": {"businessId": business_id, "createdAt": {"$gte": since}}},
            {"$group": {"_id": "$foodItemId", "totalQuantity": {"$sum": "$quantity"}, "totalRevenue": {"$sum": "$totalPrice"}}},
        ]
        cursor = self.collection.aggregate(pipeline)
        return [d async for d in cursor]
