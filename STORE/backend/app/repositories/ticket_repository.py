from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.repositories.base import BaseRepository


class TicketRepository(BaseRepository):
    def __init__(self, db: Any | None) -> None:
        super().__init__(db, "tickets")

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

    async def list(self, *, business_id: str, status: Optional[str] = None, assigned_to: Optional[str] = None) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"businessId": business_id}
        if status:
            query["status"] = status
        if assigned_to:
            query["assignedTo"] = assigned_to
        cursor = self.collection.find(query).sort("createdAt", -1)
        return [self._serialize(item) async for item in cursor]

    async def get(self, *, business_id: str, ticket_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(ticket_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def create(self, *, business_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "businessId": business_id,
            "title": payload.get("title"),
            "description": payload.get("description"),
            "priority": payload.get("priority") or "MEDIUM",
            "status": payload.get("status") or "OPEN",
            "raisedBy": payload.get("raisedBy"),
            "assignedTo": payload.get("assignedTo"),
            "comments": payload.get("comments") or [],
            "attachments": payload.get("attachments") or [],
            "createdAt": now,
            "updatedAt": now,
        }
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    async def update(self, *, business_id: str, ticket_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(ticket_id)
        except Exception:
            return None
        update = {k: v for k, v in payload.items() if v is not None}
        update["updatedAt"] = datetime.now(timezone.utc)
        await self.collection.update_one({"_id": oid, "businessId": business_id}, {"$set": update})
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def add_comment(self, *, business_id: str, ticket_id: str, comment: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(ticket_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        await self.collection.update_one(
            {"_id": oid, "businessId": business_id},
            {"$push": {"comments": comment}, "$set": {"updatedAt": now}},
        )
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def set_status(self, *, business_id: str, ticket_id: str, status: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(ticket_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        await self.collection.update_one(
            {"_id": oid, "businessId": business_id},
            {"$set": {"status": status, "updatedAt": now}},
        )
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def assign(self, *, business_id: str, ticket_id: str, assigned_to: Optional[str]) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(ticket_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        await self.collection.update_one(
            {"_id": oid, "businessId": business_id},
            {"$set": {"assignedTo": assigned_to, "updatedAt": now}},
        )
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)

    async def add_attachments(self, *, business_id: str, ticket_id: str, attachments: List[str]) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(ticket_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        await self.collection.update_one(
            {"_id": oid, "businessId": business_id},
            {"$push": {"attachments": {"$each": attachments}}, "$set": {"updatedAt": now}},
        )
        doc = await self.collection.find_one({"_id": oid, "businessId": business_id})
        return self._serialize(doc)
