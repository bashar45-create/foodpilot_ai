from __future__ import annotations

from typing import Annotated, Any, Optional

from pydantic import BaseModel, Field


class AllocationCreateRequest(BaseModel):
    model_config = {"populate_by_name": True}

    storeId: Annotated[str, Field(min_length=1)]
    foodItemId: Annotated[str, Field(min_length=1)]
    quantity: Annotated[float, Field(gt=0)]
    date: Optional[str] = None
    notes: Optional[str] = None


class AllocationUpdateRequest(BaseModel):
    model_config = {"populate_by_name": True}

    quantity: Optional[float] = None
    notes: Optional[str] = None


class AllocationDeduction(BaseModel):
    ingredientId: str
    ingredientName: Optional[str] = None
    perUnit: float
    required: float
    before: float
    after: float


class AllocationResponse(BaseModel):
    id: str
    businessId: str
    storeId: str
    foodItemId: str
    foodName: Optional[str] = None
    recipeId: Optional[str] = None
    quantity: float
    unitPrice: float = 0
    totalCost: float = 0
    status: str = "ACTIVE"
    date: str
    createdBy: Optional[str] = None
    notes: Optional[str] = None
    deductions: list[AllocationDeduction] = []
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None
    sold: Optional[int] = None
    remaining: Optional[float] = None
    revenue: Optional[float] = None