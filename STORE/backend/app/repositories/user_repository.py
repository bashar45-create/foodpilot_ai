from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId

from app.repositories.base import BaseRepository


class UserRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "users")

    @property
    def collection(self):
        return self.db[self.collection_name]

    @staticmethod
    def _serialize(doc):
        if not doc:
            return None
        payload = dict(doc)
        payload["id"] = str(payload.pop("_id"))
        payload.pop("passwordHash", None)
        payload.pop("refreshToken", None)
        return payload

    async def list(self, *, business_id, role=None, store_id=None, active=None):
        query = {"businessId": business_id}
        if role:
            query["role"] = role
        if store_id:
            query["assignedStore"] = store_id
        if active is not None:
            query["isActive"] = active
        cursor = self.collection.find(query).sort("createdAt", -1)
        return [self._serialize(d) async for d in cursor]

    async def get(self, *, business_id, user_id):
        try:
            oid = ObjectId(user_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def find_by_email(self, *, email, business_id=None):
        query = {"email": email}
        if business_id is not None:
            query["businessId"] = business_id
        return await self.collection.find_one(query)

    async def find_by_email_any_business(self, *, email):
        return await self.collection.find_one({"email": email})

    async def create(self, *, business_id, payload):
        now = datetime.now(timezone.utc)
        doc = {"businessId": business_id, "isActive": True, "createdAt": now, "updatedAt": now, "lastLogin": None}
        for k, v in payload.items():
            doc[k] = v
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def update(self, *, business_id, user_id, payload):
        try:
            oid = ObjectId(user_id)
        except Exception:
            return None
        update = {k: v for k, v in payload.items() if v is not None}
        update["updatedAt"] = datetime.now(timezone.utc)
        await self.collection.update_one({"_id": oid, "businessId": business_id}, {"$set": update})
        return await self.get(business_id=business_id, user_id=user_id)

    async def delete(self, *, business_id, user_id):
        try:
            oid = ObjectId(user_id)
        except Exception:
            return False
        result = await self.collection.delete_one({"_id": oid, "businessId": business_id})
        return result.deleted_count == 1
