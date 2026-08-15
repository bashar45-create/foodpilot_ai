from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field


class IngredientCreateRequest(BaseModel):
    model_config = {"populate_by_name": True}

    name: Annotated[str, Field(min_length=1)]
    category: str | None = None
    unit: Annotated[str, Field(min_length=1)]
    currentStock: float | None = None
    minimumStock: float = 0
    maximumStock: float | None = None
    supplierId: str | None = None
    purchasePrice: float | None = None
    costPerUnit: float | None = None
    barcode: str | None = None


class IngredientUpdateRequest(BaseModel):
    model_config = {"populate_by_name": True}

    name: str | None = None
    category: str | None = None
    unit: str | None = None
    currentStock: float | None = None
    minimumStock: float | None = None
    maximumStock: float | None = None
    supplierId: str | None = None
    purchasePrice: float | None = None
    costPerUnit: float | None = None
    barcode: str | None = None


class PurchaseRequest(BaseModel):
    ingredientId: str
    quantity: float
    unit: str
    purchasePrice: float
    supplierId: str


class AdjustmentRequest(BaseModel):
    ingredientId: str
    quantity: float
    reason: Annotated[str, Field(min_length=1)]
    storeId: str | None = None


class TransferRequest(BaseModel):
    ingredientId: str
    fromStoreId: str
    toStoreId: str
    quantity: float


class AllocationRequest(BaseModel):
    ingredientId: str
    storeId: str
    quantity: float
    date: str


class ReturnRequest(BaseModel):
    ingredientId: str
    storeId: str
    quantity: float
    date: str


class FoodAllocationRequest(BaseModel):
    """Allocate N units of a food item to a store; ingredients are auto-deducted
    from store inventory according to the recipe."""

    storeId: Annotated[str, Field(min_length=1)]
    foodItemId: Annotated[str, Field(min_length=1)]
    quantity: Annotated[float, Field(gt=0)]


class FoodAllocationDeduction(BaseModel):
    ingredientId: str
    quantity: float
    before: float
    after: float


class SupplierCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1)]
    contact: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None


class SupplierUpdateRequest(BaseModel):
    name: str | None = None
    contact: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
