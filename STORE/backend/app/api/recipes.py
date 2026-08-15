from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import ConflictError, NotFoundError
from app.core.response import success_payload
from app.database.client import get_database_dependency
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.recipe import RecipeCreateRequest, RecipeUpdateRequest
from app.services.recipe_service import IngredientNotFoundForRecipeError, RecipeConflictError, RecipeNotFoundError, RecipeService

router = APIRouter(prefix="/recipes", tags=["recipes"])


def _service(db: AsyncIOMotorDatabase = Depends(get_database_dependency)) -> RecipeService:
    return RecipeService(db)


def _bid(current_user: CurrentUser) -> str:
    return current_user.businessId or "business-default"


@router.get("")
async def list_recipes(
    current_user: CurrentUser = Depends(get_current_user),
    service: RecipeService = Depends(_service),
):
    items = await service.list_recipes(business_id=_bid(current_user))
    return success_payload(items)


@router.get("/{recipe_id}")
async def get_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: RecipeService = Depends(_service),
):
    try:
        item = await service.get_recipe(business_id=_bid(current_user), recipe_id=recipe_id)
    except RecipeNotFoundError:
        raise NotFoundError("RECIPE_NOT_FOUND", "Recipe not found")
    return success_payload(item)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_recipe(
    body: RecipeCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: RecipeService = Depends(_service),
):
    payload: dict[str, Any] = body.model_dump()
    try:
        item = await service.create_recipe(business_id=_bid(current_user), payload=payload, actor_user_id=current_user.userId or "")
    except RecipeConflictError as exc:
        raise ConflictError("RECIPE_EXISTS", f"Recipe '{exc}' already exists")
    except IngredientNotFoundForRecipeError as exc:
        raise NotFoundError("INGREDIENT_NOT_FOUND", f"Ingredient '{exc}' not found")
    except ValueError as exc:
        raise ConflictError("VALIDATION_ERROR", str(exc))
    return success_payload(item, message="Recipe created")


@router.put("/{recipe_id}")
async def update_recipe(
    recipe_id: str,
    body: RecipeUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: RecipeService = Depends(_service),
):
    payload = body.model_dump(exclude_none=True)
    try:
        item = await service.update_recipe(business_id=_bid(current_user), recipe_id=recipe_id, payload=payload, actor_user_id=current_user.userId or "")
    except RecipeNotFoundError:
        raise NotFoundError("RECIPE_NOT_FOUND", "Recipe not found")
    except RecipeConflictError as exc:
        raise ConflictError("RECIPE_EXISTS", f"Recipe '{exc}' already exists")
    except IngredientNotFoundForRecipeError as exc:
        raise NotFoundError("INGREDIENT_NOT_FOUND", f"Ingredient '{exc}' not found")
    return success_payload(item)


@router.delete("/{recipe_id}", status_code=status.HTTP_200_OK)
async def delete_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: RecipeService = Depends(_service),
):
    try:
        await service.delete_recipe(business_id=_bid(current_user), recipe_id=recipe_id, actor_user_id=current_user.userId or "")
    except RecipeNotFoundError:
        raise NotFoundError("RECIPE_NOT_FOUND", "Recipe not found")
    return success_payload({"deleted": True})


@router.get("/{recipe_id}/cost")
async def recipe_cost(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: RecipeService = Depends(_service),
):
    try:
        info = await service.compute_cost(business_id=_bid(current_user), recipe_id=recipe_id)
    except RecipeNotFoundError:
        raise NotFoundError("RECIPE_NOT_FOUND", "Recipe not found")
    except IngredientNotFoundForRecipeError as exc:
        raise NotFoundError("INGREDIENT_NOT_FOUND", f"Ingredient '{exc}' not found")
    return success_payload(info)
