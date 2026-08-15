from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.response import success_payload
from app.database.client import get_database_dependency
from app.dependencies.auth import CurrentUser, get_current_user
from app.dependencies.rbac import require_role
from app.schemas.ingredient import (
    AdjustmentRequest,
    AllocationRequest,
    FoodAllocationRequest,
    IngredientCreateRequest,
    IngredientUpdateRequest,
    PurchaseRequest,
    ReturnRequest,
    TransferRequest,
)
from app.services.allocation_service import AllocationError, AllocationService
from app.services.inventory_log_service import InventoryLogService
from app.services.inventory_service import IngredientConflictError, IngredientNotFoundError, InventoryService

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _service(db: AsyncIOMotorDatabase = Depends(get_database_dependency)) -> InventoryService:
    return InventoryService(db)


def _log_service(db: AsyncIOMotorDatabase = Depends(get_database_dependency)) -> InventoryLogService:
    return InventoryLogService(db)


def _allocation_service(db: AsyncIOMotorDatabase = Depends(get_database_dependency)) -> AllocationService:
    return AllocationService(db)


@router.get("/ingredients")
async def list_ingredients(
    category: Annotated[str | None, Query()] = None,
    lowStock: Annotated[bool | None, Query()] = None,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryService = Depends(_service),
):
    rows = await service.list_ingredients(business_id=current_user.businessId or "", category=category, low_stock=lowStock)
    return success_payload(rows)


@router.post("/ingredients", status_code=status.HTTP_201_CREATED)
async def create_ingredient(
    body: IngredientCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryService = Depends(_service),
):
    payload: dict[str, Any] = body.model_dump()
    if payload.get("costPerUnit") is None and payload.get("purchasePrice") is not None:
        payload["costPerUnit"] = payload.pop("purchasePrice")
    else:
        payload.pop("purchasePrice", None)
    payload.pop("maximumStock", None)
    payload.pop("supplierId", None)
    payload.pop("barcode", None)
    try:
        item = await service.create_ingredient(business_id=current_user.businessId or "", payload=payload, actor_user_id=current_user.userId or "")
    except IngredientConflictError as exc:
        raise ConflictError("INGREDIENT_EXISTS", f"Ingredient '{exc}' already exists")
    except ValueError as exc:
        raise ConflictError("VALIDATION_ERROR", str(exc))
    return success_payload(item, message="Ingredient created")


@router.get("/ingredients/{ingredient_id}")
async def get_ingredient(
    ingredient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryService = Depends(_service),
):
    try:
        item = await service.get_ingredient(business_id=current_user.businessId or "", ingredient_id=ingredient_id)
    except IngredientNotFoundError:
        raise NotFoundError("INGREDIENT_NOT_FOUND", "Ingredient not found")
    return success_payload(item)


@router.put("/ingredients/{ingredient_id}")
async def update_ingredient(
    ingredient_id: str,
    body: IngredientUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryService = Depends(_service),
):
    payload: dict[str, Any] = body.model_dump(exclude_none=True)
    if payload.get("costPerUnit") is None and payload.get("purchasePrice") is not None:
        payload["costPerUnit"] = payload.pop("purchasePrice")
    else:
        payload.pop("purchasePrice", None)
    payload.pop("maximumStock", None)
    payload.pop("supplierId", None)
    payload.pop("barcode", None)
    try:
        item = await service.update_ingredient(business_id=current_user.businessId or "", ingredient_id=ingredient_id, payload=payload, actor_user_id=current_user.userId or "")
    except IngredientNotFoundError:
        raise NotFoundError("INGREDIENT_NOT_FOUND", "Ingredient not found")
    except IngredientConflictError as exc:
        raise ConflictError("INGREDIENT_EXISTS", f"Ingredient '{exc}' already exists")
    return success_payload(item, message="Ingredient updated")


@router.delete("/ingredients/{ingredient_id}", status_code=status.HTTP_200_OK)
async def delete_ingredient(
    ingredient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryService = Depends(_service),
):
    try:
        await service.delete_ingredient(business_id=current_user.businessId or "", ingredient_id=ingredient_id, actor_user_id=current_user.userId or "")
    except IngredientNotFoundError:
        raise NotFoundError("INGREDIENT_NOT_FOUND", "Ingredient not found")
    return success_payload({"deleted": True}, message="Ingredient deleted")


@router.get("/low-stock")
async def low_stock(
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryService = Depends(_service),
):
    rows = await service.low_stock(business_id=current_user.businessId or "")
    return success_payload(rows)


@router.post("/purchase", status_code=status.HTTP_201_CREATED)
async def purchase(
    body: PurchaseRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryLogService = Depends(_log_service),
):
    try:
        result = await service.purchase(
            business_id=current_user.businessId or "",
            ingredient_id=body.ingredientId,
            quantity=body.quantity,
            unit_price=body.purchasePrice,
            supplier_id=body.supplierId or None,
            worker_id=current_user.userId,
        )
    except LookupError:
        raise NotFoundError("INGREDIENT_NOT_FOUND", "Ingredient not found")
    return success_payload(result, message="Purchase recorded")


@router.post("/adjust", status_code=status.HTTP_201_CREATED)
async def adjust(
    body: AdjustmentRequest,
    current_user: CurrentUser = Depends(require_role(["MANAGER", "OWNER", "ADMIN"])),
    service: InventoryLogService = Depends(_log_service),
):
    try:
        result = await service.adjust(
            business_id=current_user.businessId or "",
            ingredient_id=body.ingredientId,
            quantity=body.quantity,
            reason=body.reason,
            store_id=body.storeId,
            worker_id=current_user.userId,
        )
    except LookupError:
        raise NotFoundError("INGREDIENT_NOT_FOUND", "Ingredient not found")
    return success_payload(result, message="Adjustment recorded")


@router.post("/transfer", status_code=status.HTTP_201_CREATED)
async def transfer(
    body: TransferRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryLogService = Depends(_log_service),
):
    try:
        result = await service.transfer(
            business_id=current_user.businessId or "",
            ingredient_id=body.ingredientId,
            from_store_id=body.fromStoreId,
            to_store_id=body.toStoreId,
            quantity=body.quantity,
            worker_id=current_user.userId,
        )
    except LookupError:
        raise NotFoundError("INGREDIENT_NOT_FOUND", "Ingredient not found")
    except ValueError as exc:
        raise ConflictError("INSUFFICIENT_STOCK", str(exc))
    return success_payload(result, message="Transfer recorded")


@router.post("/allocate", status_code=status.HTTP_201_CREATED)
async def allocate(
    body: AllocationRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryLogService = Depends(_log_service),
):
    try:
        result = await service.allocate(
            business_id=current_user.businessId or "",
            ingredient_id=body.ingredientId,
            store_id=body.storeId,
            quantity=body.quantity,
            worker_id=current_user.userId,
        )
    except LookupError:
        raise NotFoundError("INGREDIENT_NOT_FOUND", "Ingredient not found")
    except ValueError as exc:
        raise ConflictError("INSUFFICIENT_STOCK", str(exc))
    return success_payload(result, message="Allocation recorded")


@router.post("/return", status_code=status.HTTP_201_CREATED)
async def return_stock(
    body: ReturnRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryLogService = Depends(_log_service),
):
    try:
        result = await service.return_stock(
            business_id=current_user.businessId or "",
            ingredient_id=body.ingredientId,
            store_id=body.storeId,
            quantity=body.quantity,
            worker_id=current_user.userId,
        )
    except LookupError:
        raise NotFoundError("INGREDIENT_NOT_FOUND", "Ingredient not found")
    return success_payload(result, message="Return recorded")


@router.get("/history/{ingredient_id}")
async def history(
    ingredient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: InventoryLogService = Depends(_log_service),
):
    rows = await service.history(business_id=current_user.businessId or "", ingredient_id=ingredient_id)
    return success_payload(rows)


@router.post("/allocate-food", status_code=status.HTTP_201_CREATED)
async def allocate_food(
    body: FoodAllocationRequest,
    current_user: CurrentUser = Depends(require_role(["MANAGER", "OWNER", "ADMIN"])),
    service: AllocationService = Depends(_allocation_service),
):
    """Allocate N units of a food item to a store.

    Resolves the food item's active recipe, computes the required ingredients
    per unit × N, and atomically deducts from the store's inventory.
    Rolls back the entire allocation if any ingredient is insufficient.
    Now writes a persistent record to the ``allocations`` collection.
    """
    try:
        result = await service.create_allocation(
            business_id=current_user.businessId or "",
            store_id=body.storeId,
            food_id=body.foodItemId,
            quantity=body.quantity,
            created_by=current_user.userId,
        )
    except AllocationError as exc:
        msg = str(exc)
        lower = msg.lower()
        if "not found" in lower:
            raise NotFoundError("FOOD_NOT_FOUND", msg)
        if "no active recipe" in lower or "recipe has no" in lower or "no usable ingredient" in lower:
            raise NotFoundError("NO_ACTIVE_RECIPE", msg)
        if "insufficient stock" in lower:
            raise ConflictError("INSUFFICIENT_STOCK", msg)
        if "quantity must be positive" in lower:
            raise ValidationError(msg, code="INVALID_QUANTITY")
        raise ConflictError("ALLOCATION_FAILED", msg)
    # Maintain the legacy response shape for the AllocateFoodCard widget:
    return success_payload(
        {
            "storeId": result.get("storeId"),
            "foodId": result.get("foodItemId"),
            "foodName": result.get("foodName"),
            "quantity": int(result.get("quantity") or 0),
            "transactional": result.get("transactional", False),
            "deductions": [
                {
                    "ingredientId": d["ingredientId"],
                    "quantity": d["required"],
                    "before": d["before"],
                    "after": d["after"],
                }
                for d in result.get("deductions", [])
            ],
            "id": result.get("id"),
        },
        message=f"Allocated {body.quantity} × food item to store",
    )
