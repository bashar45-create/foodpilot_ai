from __future__ import annotations

from app.models.base import TimestampedDocument


class PurchaseOrderDocument(TimestampedDocument):
    businessId: str
    supplierId: str
    ingredientId: str
    quantity: float
    unitPrice: float
    totalCost: float
    status: str = "PENDING"
