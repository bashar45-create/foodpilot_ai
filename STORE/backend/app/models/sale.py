from __future__ import annotations

from typing import Any, Literal

from app.models.base import TimestampedDocument


SaleStatus = Literal["COMPLETED", "REFUNDED"]


class SaleDocument(TimestampedDocument):
    businessId: str
    storeId: str
    items: list[dict[str, Any]] = []
    paymentMethod: str
    discount: float = 0
    tax: float = 0
    netRevenue: float = 0
    grossProfit: float = 0
    device: dict[str, Any] | None = None
    createdBy: str
    status: SaleStatus = "COMPLETED"
