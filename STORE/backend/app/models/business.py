from __future__ import annotations

from app.models.base import TimestampedDocument


class BusinessDocument(TimestampedDocument):
    name: str
    ownerId: str
    industry: str | None = None
