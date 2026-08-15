from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


MessageRole = Literal["user", "assistant", "system", "tool"]


class AIConversationCreateRequest(BaseModel):
    initialMessage: str | None = Field(default=None, min_length=1, max_length=4000)


class AIConversationUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)


class AIChatRequest(BaseModel):
    conversationId: str | None = None
    message: str = Field(min_length=1, max_length=4000)


class AIConversationListItem(BaseModel):
    id: str
    title: str
    updatedAt: datetime | None = None
    createdAt: datetime | None = None


class AIMessagePayload(BaseModel):
    id: str
    role: MessageRole
    content: str
    createdAt: datetime | None = None
    toolCalls: list[dict[str, Any]] = Field(default_factory=list)
    toolResults: list[dict[str, Any]] = Field(default_factory=list)


class AIConversationDetail(BaseModel):
    id: str
    title: str
    messages: list[AIMessagePayload] = Field(default_factory=list)
    updatedAt: datetime | None = None
    createdAt: datetime | None = None
