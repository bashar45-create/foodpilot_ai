from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import ConflictError, NotFoundError
from app.core.response import success_payload
from app.database.client import get_database_dependency
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.food import FoodCreateRequest, FoodUpdateRequest
from app.services.food_service import FoodNotFoundError, FoodService, RecipeMissingForFoodError

router = APIRouter(prefix="/food", tags=["food"])


def _service(db: AsyncIOMotorDatabase = Depends(get_database_dependency)) -> FoodService:
    return FoodService(db)


def _bid(current_user: CurrentUser) -> str:
    return current_user.businessId or "business-default"


@router.get("")
async def list_food(
    category: str | None = None,
    storeId: str | None = None,
    status_filter: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    service: FoodService = Depends(_service),
):
    items = await service.list_food(business_id=_bid(current_user), category=category, store_id=storeId, status=status_filter)
    return success_payload(items)


@router.get("/{food_id}")
async def get_food(
    food_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: FoodService = Depends(_service),
):
    try:
        item = await service.get_food(business_id=_bid(current_user), food_id=food_id)
    except FoodNotFoundError:
        raise NotFoundError("FOOD_NOT_FOUND", "Food item not found")
    return success_payload(item)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_food(
    body: FoodCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: FoodService = Depends(_service),
):
    payload: dict[str, Any] = body.model_dump()
    try:
        item = await service.create_food(business_id=_bid(current_user), payload=payload, actor_user_id=current_user.userId or "")
    except RecipeMissingForFoodError as exc:
        raise NotFoundError("RECIPE_NOT_FOUND", f"Recipe '{exc}' not found")
    except ValueError as exc:
        raise ConflictError("VALIDATION_ERROR", str(exc))
    return success_payload(item, message="Food item created")


@router.put("/{food_id}")
async def update_food(
    food_id: str,
    body: FoodUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: FoodService = Depends(_service),
):
    payload = body.model_dump(exclude_none=True)
    try:
        item = await service.update_food(business_id=_bid(current_user), food_id=food_id, payload=payload, actor_user_id=current_user.userId or "")
    except FoodNotFoundError:
        raise NotFoundError("FOOD_NOT_FOUND", "Food item not found")
    return success_payload(item)


@router.delete("/{food_id}", status_code=status.HTTP_200_OK)
async def delete_food(
    food_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: FoodService = Depends(_service),
):
    try:
        await service.delete_food(business_id=_bid(current_user), food_id=food_id, actor_user_id=current_user.userId or "")
    except FoodNotFoundError:
        raise NotFoundError("FOOD_NOT_FOUND", "Food item not found")
    return success_payload({"deleted": True})


@router.post("/{food_id}/recalculate-cost", status_code=status.HTTP_200_OK)
async def recalculate_cost(
    food_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: FoodService = Depends(_service),
):
    try:
        item = await service.recalculate_cost(business_id=_bid(current_user), food_id=food_id, actor_user_id=current_user.userId or "")
    except FoodNotFoundError:
        raise NotFoundError("FOOD_NOT_FOUND", "Food item not found")
    except RecipeMissingForFoodError as exc:
        raise NotFoundError("RECIPE_NOT_FOUND", f"Recipe '{exc}' not found")
    return success_payload(item)
