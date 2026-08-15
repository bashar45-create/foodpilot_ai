from __future__ import annotations

from typing import Any, Literal

from app.models.base import TimestampedDocument


TicketStatus = Literal["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]
TicketPriority = Literal["LOW", "MEDIUM", "HIGH", "URGENT"]


class TicketDocument(TimestampedDocument):
    businessId: str
    title: str
    description: str
    priority: TicketPriority = "MEDIUM"
    status: TicketStatus = "OPEN"
    raisedBy: str
    assignedTo: str | None = None
    comments: list[dict[str, Any]] = []
    attachments: list[str] = []
