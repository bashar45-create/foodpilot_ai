from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import NotFoundError


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_object_id(value: str) -> ObjectId | None:
    try:
        return ObjectId(value)
    except Exception:
        return None


def serialize_value(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        # Ensure ISO 8601 strings so the JSON response is portable and the
        # frontend can render them with date-fns without extra parsing.
        return value.isoformat()
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: serialize_value(item) for key, item in value.items()}
    return value


def normalize_document(doc: dict[str, Any]) -> dict[str, Any]:
    payload = serialize_value(doc)
    if "_id" in payload:
        payload["id"] = payload.pop("_id")
    return payload


def _conversation_filter(conversation_id: str, business_id: str, user_id: str) -> dict[str, Any]:
    object_id = _to_object_id(conversation_id)
    if object_id is None:
        return {"_id": conversation_id, "businessId": business_id, "userId": user_id}
    return {"_id": object_id, "businessId": business_id, "userId": user_id}


def _message_filter(conversation_id: str) -> dict[str, Any]:
    object_id = _to_object_id(conversation_id)
    if object_id is None:
        return {"conversationId": conversation_id}
    return {"conversationId": {"$in": [conversation_id, object_id]}}


async def create_conversation(db: AsyncIOMotorDatabase, *, business_id: str, user_id: str, title: str) -> dict[str, Any]:
    doc = {
        "businessId": business_id,
        "userId": user_id,
        "title": title,
        "createdAt": _utcnow(),
        "updatedAt": _utcnow(),
    }
    result = await db["ai_conversations"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return normalize_document(doc)


async def list_conversations(
    db: AsyncIOMotorDatabase,
    *,
    business_id: str,
    user_id: str,
    page: int,
    limit: int,
) -> tuple[list[dict[str, Any]], int]:
    base_filter = {"businessId": business_id, "userId": user_id}
    total = await db["ai_conversations"].count_documents(base_filter)
    skip = max(page - 1, 0) * limit
    cursor = db["ai_conversations"].find(base_filter).sort("updatedAt", -1).skip(skip).limit(limit)
    rows = [normalize_document(row) async for row in cursor]
    return rows, total


async def get_conversation(db: AsyncIOMotorDatabase, *, conversation_id: str, business_id: str, user_id: str) -> dict[str, Any]:
    row = await db["ai_conversations"].find_one(_conversation_filter(conversation_id, business_id, user_id))
    if not row:
        raise NotFoundError(code="AI_CONVERSATION_NOT_FOUND", message="Conversation not found")
    return normalize_document(row)


async def delete_conversation(db: AsyncIOMotorDatabase, *, conversation_id: str, business_id: str, user_id: str) -> None:
    await get_conversation(db, conversation_id=conversation_id, business_id=business_id, user_id=user_id)
    await db["ai_conversations"].delete_one(_conversation_filter(conversation_id, business_id, user_id))
    await db["ai_messages"].delete_many(_message_filter(conversation_id))


async def update_conversation(
    db: AsyncIOMotorDatabase,
    *,
    conversation_id: str,
    business_id: str,
    user_id: str,
    title: str | None = None,
) -> dict[str, Any]:
    conversation = await get_conversation(db, conversation_id=conversation_id, business_id=business_id, user_id=user_id)
    updates: dict[str, Any] = {"updatedAt": _utcnow()}
    if title is not None:
        updates["title"] = title.strip()[:200] or conversation.get("title") or "Conversation"
    await db["ai_conversations"].update_one(_conversation_filter(conversation_id, business_id, user_id), {"$set": updates})
    conversation.update(updates)
    return conversation


async def append_message(
    db: AsyncIOMotorDatabase,
    *,
    conversation_id: str,
    business_id: str,
    role: str,
    content: str,
    tool_calls: list[dict[str, Any]] | None = None,
    tool_results: list[dict[str, Any]] | None = None,
    usage: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = _utcnow()
    doc: dict[str, Any] = {
        "conversationId": conversation_id,
        "businessId": business_id,
        "role": role,
        "content": content,
        "toolCalls": tool_calls or [],
        "toolResults": tool_results or [],
        "usage": usage or {},
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db["ai_messages"].insert_one(doc)
    doc["_id"] = result.inserted_id
    await db["ai_conversations"].update_one(
        {"_id": _to_object_id(conversation_id) or conversation_id},
        {"$set": {"updatedAt": now}},
    )
    return normalize_document(doc)


async def load_messages(
    db: AsyncIOMotorDatabase,
    *,
    conversation_id: str,
    business_id: str,
    limit: int,
) -> list[dict[str, Any]]:
    cursor = (
        db["ai_messages"]
        .find({"businessId": business_id, **_message_filter(conversation_id)})
        .sort("createdAt", 1)
        .limit(limit)
    )
    return [normalize_document(row) async for row in cursor]
