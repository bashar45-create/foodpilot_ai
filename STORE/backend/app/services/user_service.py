from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.core.security import hash_password, verify_password
from app.repositories.user_repository import UserRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


class UserNotFoundError(Exception):
    pass


class UserConflictError(Exception):
    pass


class InvalidRoleError(Exception):
    pass


_ALLOWED_ROLES = {"OWNER", "MANAGER", "WORKER", "SUPER_ADMIN"}
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class UserService:
    def __init__(self, db: Any) -> None:
        self.repo = UserRepository(db)

    async def list_users(self, *, business_id: str, role: Optional[str] = None, store_id: Optional[str] = None, active: Optional[bool] = None) -> List[Dict[str, Any]]:
        return await self.repo.list(business_id=business_id, role=role, store_id=store_id, active=active)

    async def get_user(self, *, business_id: str, user_id: str) -> Dict[str, Any]:
        item = await self.repo.find_by_email_any_business(email="") if False else None
        item = await self.repo.get(business_id=business_id, user_id=user_id)
        if not item:
            raise UserNotFoundError(user_id)
        return item

    async def create_user(self, *, business_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        name = (payload.get("name") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        role = payload.get("role")
        if not name:
            raise ValueError("name is required")
        if not _EMAIL_RE.match(email):
            raise ValueError("valid email is required")
        if role not in _ALLOWED_ROLES:
            raise InvalidRoleError(role or "")
        existing = await self.repo.find_by_email(email=email)
        if existing:
            raise UserConflictError(email)
        raw = payload.get("password") or "changeme123"
        doc = {
            "name": name,
            "email": email,
            "role": role,
            "assignedStore": payload.get("assignedStore"),
            "passwordHash": hash_password(raw),
        }
        item = await self.repo.create(business_id=business_id, payload=doc)
        await sync_service.publish(SyncEvent(
            entity="user", action="created", businessId=business_id,
            recordId=item["id"], payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def update_user(self, *, business_id: str, user_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        await self.get_user(business_id=business_id, user_id=user_id)
        update: Dict[str, Any] = {}
        if "name" in payload and payload["name"] is not None:
            update["name"] = payload["name"].strip()
        if "email" in payload and payload["email"] is not None:
            new_email = payload["email"].strip().lower()
            if not _EMAIL_RE.match(new_email):
                raise ValueError("valid email is required")
            dup = await self.repo.find_by_email(email=new_email)
            if dup and dup["_id"] != __import__("bson").ObjectId(user_id):
                raise UserConflictError(new_email)
            update["email"] = new_email
        if "role" in payload and payload["role"] is not None:
            if payload["role"] not in _ALLOWED_ROLES:
                raise InvalidRoleError(payload["role"])
            update["role"] = payload["role"]
        item = await self.repo.update(business_id=business_id, user_id=user_id, payload=update)
        if not item:
            raise UserNotFoundError(user_id)
        await sync_service.publish(SyncEvent(
            entity="user", action="updated", businessId=business_id,
            recordId=user_id, payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def change_status(self, *, business_id: str, user_id: str, is_active: bool, actor_user_id: str) -> Dict[str, Any]:
        await self.get_user(business_id=business_id, user_id=user_id)
        item = await self.repo.update(business_id=business_id, user_id=user_id, payload={"isActive": is_active})
        if not item:
            raise UserNotFoundError(user_id)
        await sync_service.publish(SyncEvent(
            entity="user", action="updated", businessId=business_id,
            recordId=user_id, payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def assign_store(self, *, business_id: str, user_id: str, store_id: Optional[str], actor_user_id: str) -> Dict[str, Any]:
        await self.get_user(business_id=business_id, user_id=user_id)
        item = await self.repo.update(business_id=business_id, user_id=user_id, payload={"assignedStore": store_id})
        if not item:
            raise UserNotFoundError(user_id)
        await sync_service.publish(SyncEvent(
            entity="user", action="updated", businessId=business_id,
            recordId=user_id, payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def reset_password(self, *, business_id: str, user_id: str, new_password: Optional[str] = None, actor_user_id: str) -> Dict[str, Any]:
        await self.get_user(business_id=business_id, user_id=user_id)
        pwd = new_password or "changeme123"
        item = await self.repo.update(business_id=business_id, user_id=user_id, payload={"passwordHash": hash_password(pwd)})
        if not item:
            raise UserNotFoundError(user_id)
        await sync_service.publish(SyncEvent(
            entity="user", action="updated", businessId=business_id,
            recordId=user_id, payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def authenticate(self, *, email: str, password_text: str) -> Dict[str, Any]:
        email = (email or "").strip().lower()
        doc = await self.repo.find_by_email_any_business(email=email)
        if not doc or not doc.get("isActive", True):
            raise UserNotFoundError(email)
        if not verify_password(password_text, doc.get("passwordHash", "")):
            raise UserNotFoundError(email)
        await self.collection_update_lastlogin(doc["_id"])
        payload = dict(doc)
        payload["id"] = str(payload.pop("_id"))
        payload.pop("passwordHash", None)
        payload.pop("refreshToken", None)
        payload["assignedStore"] = payload.get("assignedStore") or None
        return payload

    async def collection_update_lastlogin(self, _id) -> None:
        from datetime import datetime, timezone
        await self.repo.collection.update_one({"_id": _id}, {"$set": {"lastLogin": datetime.now(timezone.utc)}})
