from __future__ import annotations

from app.models.base import TimestampedDocument


class SupplierDocument(TimestampedDocument):
    businessId: str
    name: str
    contact: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    isActive: bool = True
