from __future__ import annotations

from typing import Any, Annotated

from pydantic import BaseModel, Field


class TicketCreateRequest(BaseModel):
    title: Annotated[str, Field(min_length=1)]
    description: Annotated[str, Field(min_length=1)]
    priority: str = "MEDIUM"


class TicketUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    assignedTo: str | None = None


class TicketCommentRequest(BaseModel):
    text: Annotated[str, Field(min_length=1)]


class TicketStatusUpdateRequest(BaseModel):
    status: Annotated[str, Field(min_length=1)]


class TicketAssignRequest(BaseModel):
    assignedTo: str | None = None


class TicketAttachmentRequest(BaseModel):
    attachments: list[str] = []
