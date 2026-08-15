from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class SaleItemInput(BaseModel):
    foodItemId: str
    quantity: float
    unitPrice: float


class SaleCreateRequest(BaseModel):
    storeId: str
    items: list[SaleItemInput] = []
    paymentMethod: str
    discount: float = 0
    tax: float = 0
    device: dict[str, Any] | None = None


class SaleBatchCreateRequest(BaseModel):
    sales: list[SaleCreateRequest] = []


class SaleRefundRequest(BaseModel):
    reason: str | None = None


class SaleDailyCloseRequest(BaseModel):
    storeId: str
    date: str | None = None
