from __future__ import annotations

from typing import Any, Literal

from app.models.base import TimestampedDocument


InventoryAction = Literal["PURCHASE", "SALE", "TRANSFER", "RETURN", "ALLOCATION", "WASTE", "ADJUSTMENT"]


class InventoryLogDocument(TimestampedDocument):
    businessId: str
    ingredientId: str
    storeId: str | None = None
    workerId: str | None = None
    action: InventoryAction
    quantity: float
    before: float
    after: float
    referenceType: str | None = None
    referenceId: str | None = None
    reason: str | None = None
    timestamp: str | None = None
