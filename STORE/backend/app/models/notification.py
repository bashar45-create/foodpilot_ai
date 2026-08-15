from __future__ import annotations

from typing import Any

from app.models.base import TimestampedDocument


class NotificationDocument(TimestampedDocument):
    businessId: str
    userId: str
    type: str
    title: str
    body: str
    isRead: bool = False
    payload: dict[str, Any] = {}
