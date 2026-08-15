from __future__ import annotations

from typing import Any

from app.ai.agent import run_ai_agent
from app.ai.memory import (
    append_message,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    load_messages,
    update_conversation,
)
from app.ai.prompts import QUICK_PROMPTS, get_quick_prompts
from app.database.client import get_database
from app.services.base import BaseService


class AIService(BaseService):
    def __init__(self) -> None:
        super().__init__(repository=None)
        self.db = get_database()

    async def create_conversation(self, *, business_id: str, user_id: str, initial_message: str | None = None) -> dict[str, Any]:
        title_source = (initial_message or "New conversation").strip()
        title = (title_source[:80] or "New conversation").strip()
        conversation = await create_conversation(self.db, business_id=business_id, user_id=user_id, title=title)
        if initial_message:
            await append_message(
                self.db,
                conversation_id=conversation["id"],
                business_id=business_id,
                role="user",
                content=initial_message,
            )
        return conversation

    async def list_conversations(self, *, business_id: str, user_id: str, page: int, limit: int) -> dict[str, Any]:
        rows, total = await list_conversations(self.db, business_id=business_id, user_id=user_id, page=page, limit=limit)
        return {
            "items": rows,
            "meta": {"page": page, "limit": limit, "total": total},
        }

    async def get_conversation(self, *, conversation_id: str, business_id: str, user_id: str) -> dict[str, Any]:
        conversation = await get_conversation(self.db, conversation_id=conversation_id, business_id=business_id, user_id=user_id)
        messages = await load_messages(self.db, conversation_id=conversation_id, business_id=business_id, limit=500)
        return {
            **conversation,
            "messages": messages,
        }

    async def delete_conversation(self, *, conversation_id: str, business_id: str, user_id: str) -> None:
        await delete_conversation(self.db, conversation_id=conversation_id, business_id=business_id, user_id=user_id)

    async def update_conversation(
        self,
        *,
        conversation_id: str,
        business_id: str,
        user_id: str,
        title: str | None = None,
    ) -> dict[str, Any]:
        return await update_conversation(
            self.db,
            conversation_id=conversation_id,
            business_id=business_id,
            user_id=user_id,
            title=title,
        )

    async def chat(
        self,
        *,
        business_id: str,
        user_id: str,
        role: str | None,
        message: str,
        conversation_id: str | None,
    ) -> dict[str, Any]:
        if conversation_id:
            conversation = await get_conversation(self.db, conversation_id=conversation_id, business_id=business_id, user_id=user_id)
        else:
            conversation = await create_conversation(
                self.db,
                business_id=business_id,
                user_id=user_id,
                title=(message.strip()[:80] or "New conversation"),
            )
            conversation_id = conversation["id"]

        await append_message(
            self.db,
            conversation_id=conversation_id,
            business_id=business_id,
            role="user",
            content=message,
        )

        history = await load_messages(self.db, conversation_id=conversation_id, business_id=business_id, limit=20)
        ai_result = await run_ai_agent(
            self.db,
            business_id=business_id,
            user_id=user_id,
            role=role,
            history=history,
            user_message=message,
        )

        saved_assistant_message = await append_message(
            self.db,
            conversation_id=conversation_id,
            business_id=business_id,
            role="assistant",
            content=ai_result["content"],
            tool_calls=ai_result.get("toolCalls") or [],
            tool_results=ai_result.get("toolResults") or [],
            usage=ai_result.get("usage") or {},
        )

        return {
            "conversationId": conversation_id,
            "message": saved_assistant_message,
        }

    async def quick_prompts(self) -> dict[str, Any]:
        return {"items": get_quick_prompts()}

    async def placeholder(self, data: Any = None, *, message: str = "AI module placeholder") -> dict[str, Any]:
        return await super().placeholder(data, message=message)
