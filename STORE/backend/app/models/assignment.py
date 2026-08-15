from __future__ import annotations

from app.models.base import TimestampedDocument


class AssignmentDocument(TimestampedDocument):
    businessId: str
    userId: str
    storeId: str
    assignedAt: str | None = None
    assignedBy: str | None = None
    isActive: bool = True
