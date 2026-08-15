from __future__ import annotations

from app.models.base import TimestampedDocument


class StockTransferDocument(TimestampedDocument):
    businessId: str
    ingredientId: str
    fromStoreId: str
    toStoreId: str
    quantity: float
    status: str = "PENDING"
