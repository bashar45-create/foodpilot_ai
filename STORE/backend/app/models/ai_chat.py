from __future__ import annotations

from typing import Any

from pydantic import Field

from app.models.base import TimestampedDocument


class AiConversationDocument(TimestampedDocument):
    businessId: str
    userId: str
    title: str


class AiMessageDocument(TimestampedDocument):
    conversationId: str
    businessId: str
    role: str
    content: str
    toolCalls: list[dict[str, Any]] = Field(default_factory=list)
    toolResults: list[dict[str, Any]] = Field(default_factory=list)
