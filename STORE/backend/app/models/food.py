from __future__ import annotations

from typing import Literal

from app.models.base import TimestampedDocument


FoodStatus = Literal["ACTIVE", "INACTIVE"]


class FoodDocument(TimestampedDocument):
    businessId: str
    recipeId: str
    name: str
    category: str | None = None
    price: float = 0
    cost: float = 0
    estimatedProfit: float = 0
    preparationTime: int | None = None
    assignedStores: list[str] = []
    image: str | None = None
    status: FoodStatus = "ACTIVE"
