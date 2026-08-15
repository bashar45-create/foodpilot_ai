from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field


class FoodCreateRequest(BaseModel):
    recipeId: str
    name: Annotated[str, Field(min_length=1)]
    category: str | None = None
    price: float
    assignedStores: list[str] = []
    image: str | None = None


class FoodUpdateRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    price: float | None = None
    assignedStores: list[str] | None = None
    image: str | None = None
    status: str | None = None


class FoodAvailabilityRequest(BaseModel):
    storeId: str
    isAvailable: bool


class FoodCategoryCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1)]


class FoodRecalculateCostRequest(BaseModel):
    foodItemId: str
