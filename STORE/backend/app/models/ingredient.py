from __future__ import annotations

from app.models.base import TimestampedDocument


class IngredientDocument(TimestampedDocument):
    businessId: str
    name: str
    category: str | None = None
    unit: str
    minimumStock: float = 0
    maximumStock: float | None = None
    currentStock: float = 0
    supplierId: str | None = None
    purchasePrice: float = 0
    averageCost: float = 0
    barcode: str | None = None
