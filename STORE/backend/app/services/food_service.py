from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.repositories.food_repository import FoodRepository
from app.schemas.sync import SyncEvent
from app.services.recipe_service import IngredientNotFoundForRecipeError, RecipeNotFoundError, RecipeService
from app.services.sync_service import sync_service


class FoodNotFoundError(Exception):
    pass


class RecipeMissingForFoodError(Exception):
    pass


class FoodService:
    def __init__(self, db: Any) -> None:
        self.repo = FoodRepository(db)
        self.recipes = RecipeService(db)

    async def list_food(self, *, business_id: str, category: Optional[str] = None, store_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        return await self.repo.list(business_id=business_id, category=category, store_id=store_id, status=status)

    async def get_food(self, *, business_id: str, food_id: str) -> Dict[str, Any]:
        item = await self.repo.get(business_id=business_id, food_id=food_id)
        if not item:
            raise FoodNotFoundError(food_id)
        return item

    async def create_food(self, *, business_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        recipe_id = payload.get("recipeId")
        if not recipe_id:
            raise ValueError("recipeId is required")
        try:
            cost_info = await self.recipes.compute_cost(business_id=business_id, recipe_id=recipe_id)
        except RecipeNotFoundError:
            raise RecipeMissingForFoodError(recipe_id)
        price = float(payload.get("price") or 0)
        cost = cost_info["totalCost"]
        profit = round(price - cost, 4)
        doc = {
            "recipeId": recipe_id,
            "name": (payload.get("name") or "").strip(),
            "category": payload.get("category"),
            "price": price,
            "assignedStores": payload.get("assignedStores") or [],
            "image": payload.get("image"),
            "cost": cost,
            "estimatedProfit": profit,
        }
        item = await self.repo.create(business_id=business_id, payload=doc)
        await sync_service.publish(SyncEvent(
            entity="food", action="created", businessId=business_id,
            recordId=item["id"], payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def update_food(self, *, business_id: str, food_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        await self.get_food(business_id=business_id, food_id=food_id)
        update: Dict[str, Any] = {}
        for k in ("name", "category", "price", "assignedStores", "image", "status"):
            if payload.get(k) is not None:
                update[k] = payload[k]
        if "price" in update:
            current = await self.repo.get(business_id=business_id, food_id=food_id)
            update["estimatedProfit"] = round(float(update["price"]) - float(current.get("cost") or 0), 4)
        item = await self.repo.update(business_id=business_id, food_id=food_id, payload=update)
        if not item:
            raise FoodNotFoundError(food_id)
        await sync_service.publish(SyncEvent(
            entity="food", action="updated", businessId=business_id,
            recordId=food_id, payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def delete_food(self, *, business_id: str, food_id: str, actor_user_id: str) -> None:
        ok = await self.repo.delete(business_id=business_id, food_id=food_id)
        if not ok:
            raise FoodNotFoundError(food_id)
        await sync_service.publish(SyncEvent(
            entity="food", action="deleted", businessId=business_id,
            recordId=food_id, payload=None, actorUserId=actor_user_id,
        ))

    async def recalculate_cost(self, *, business_id: str, food_id: str, actor_user_id: str) -> Dict[str, Any]:
        food = await self.get_food(business_id=business_id, food_id=food_id)
        recipe_id = food.get("recipeId")
        if not recipe_id:
            raise RecipeMissingForFoodError(recipe_id or "no-recipe")
        try:
            cost_info = await self.recipes.compute_cost(business_id=business_id, recipe_id=recipe_id)
        except RecipeNotFoundError:
            raise RecipeMissingForFoodError(recipe_id)
        cost = cost_info["totalCost"]
        price = float(food.get("price") or 0)
        update = {"cost": cost, "estimatedProfit": round(price - cost, 4)}
        item = await self.repo.update(business_id=business_id, food_id=food_id, payload=update)
        if not item:
            raise FoodNotFoundError(food_id)
        await sync_service.publish(SyncEvent(
            entity="food", action="updated", businessId=business_id,
            recordId=food_id, payload=item, actorUserId=actor_user_id,
        ))
        return item
