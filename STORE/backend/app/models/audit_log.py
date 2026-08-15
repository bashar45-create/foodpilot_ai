from __future__ import annotations

from typing import Any

from app.models.base import TimestampedDocument


class AuditLogDocument(TimestampedDocument):
    businessId: str
    userId: str
    action: str
    module: str
    documentId: str | None = None
    oldValue: dict[str, Any] | None = None
    newValue: dict[str, Any] | None = None
    timestamp: str | None = None
