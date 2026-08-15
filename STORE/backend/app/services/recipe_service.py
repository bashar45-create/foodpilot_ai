from __future__ import annotations

from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId

from app.repositories.food_repository import FoodRepository
from app.repositories.ingredient_repository import IngredientRepository
from app.repositories.recipe_repository import RecipeRepository
from app.repositories.store_repository import StoreRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


class RecipeNotFoundError(Exception):
    pass


class RecipeConflictError(Exception):
    pass


class IngredientNotFoundForRecipeError(Exception):
    pass


class RecipeService:
    def __init__(self, db: Any) -> None:
        self.repo = RecipeRepository(db)
        self.ingredients = IngredientRepository(db)
        self.food = FoodRepository(db)
        self.stores = StoreRepository(db)

    async def list_recipes(self, *, business_id: str) -> List[Dict[str, Any]]:
        items = await self.repo.list(business_id=business_id)
        # Enrich every recipe's ingredients array with `ingredientName` (and
        # back-fill `unit` if missing) so callers — especially the mobile
        # RecipesScreen — see "Bun", "Patty", "Seasoning" instead of the raw
        # Mongo _id. One round-trip per businessId for any distinct ingredient
        # IDs across all recipes.
        name_map = await self._bulk_ingredient_name_map(
            business_id, [iid for r in items for iid in (l.get("ingredientId") for l in (r.get("ingredients") or [])) if iid]
        )
        for r in items:
            self._apply_name_map(r, name_map)
        return items

    async def get_recipe(self, *, business_id: str, recipe_id: str) -> Dict[str, Any]:
        item = await self.repo.get(business_id=business_id, recipe_id=recipe_id)
        if not item:
            raise RecipeNotFoundError(recipe_id)
        name_map = await self._bulk_ingredient_name_map(
            business_id, [str(l.get("ingredientId")) for l in (item.get("ingredients") or []) if l.get("ingredientId")]
        )
        self._apply_name_map(item, name_map)
        return item

    async def _bulk_ingredient_name_map(
        self, business_id: str, ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """One round-trip lookup for many ingredient ids across many recipes."""
        uniq_strs = {str(i) for i in ids if i}
        if not uniq_strs:
            return {}
        # _id is an ObjectId in Mongo — convert strings that look like ObjectIds
        # to that type so the $in filter actually matches. Strings that aren't
        # valid ObjectIds are skipped (better than raising).
        oids: List[ObjectId] = []
        for s in uniq_strs:
            try:
                oids.append(ObjectId(s))
            except (InvalidId, TypeError):
                continue
        if not oids:
            return {}
        name_map: Dict[str, Dict[str, Any]] = {}
        cursor = self.ingredients.collection.find({"_id": {"$in": oids}})
        async for ing in cursor:
            name_map[str(ing.get("_id"))] = ing
        return name_map

    @staticmethod
    def _apply_name_map(recipe: Dict[str, Any], name_map: Dict[str, Dict[str, Any]]) -> None:
        """Mutates ``recipe`` in place, patching each ingredient line."""
        lines = recipe.get("ingredients") or []
        if not lines:
            return
        enriched: List[Dict[str, Any]] = []
        for line in lines:
            ing = name_map.get(str(line.get("ingredientId")))
            new_line = dict(line)
            if ing:
                # Don't clobber if recipe explicitly stored an ingredientName
                # at creation — but in practice we don't accept that field,
                # so this is purely defensive.
                new_line["ingredientName"] = ing.get("name") or new_line.get("ingredientName")
                # Back-fill unit only when missing.
                if not new_line.get("unit"):
                    new_line["unit"] = ing.get("unit")
            enriched.append(new_line)
        recipe["ingredients"] = enriched

    async def create_recipe(self, *, business_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        name = (payload.get("name") or "").strip()
        if not name:
            raise ValueError("name is required")
        existing = await self.repo.get_by_name(business_id=business_id, name=name)
        if existing:
            raise RecipeConflictError(name)
        await self._validate_ingredients(business_id=business_id, ingredients=payload.get("ingredients") or [])
        doc = {
            "name": name,
            "foodItemId": payload.get("foodItemId") or None,
            "ingredients": payload.get("ingredients") or [],
            "preparationSteps": payload.get("preparationSteps") or [],
            "servingSize": payload.get("servingSize"),
        }
        recipe = await self.repo.create(business_id=business_id, payload=doc)
        # First-time auto-link: when the recipe points at a food item that
        # currently has no assigned stores, copy every active store in the
        # business into the food item's assignedStores so the new recipe is
        # immediately reach-able from the worker app. If the admin has
        # already curated assignedStores, leave them alone — they own the
        # store-scoped contract from this point forward.
        food_item_id = doc.get("foodItemId")
        if food_item_id:
            await self._auto_link_food_to_business_stores(
                business_id=business_id, food_id=str(food_item_id)
            )
        await sync_service.publish(SyncEvent(
            entity="recipe", action="created", businessId=business_id,
            recordId=recipe["id"], payload=recipe, actorUserId=actor_user_id,
        ))
        return recipe

    async def update_recipe(self, *, business_id: str, recipe_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        await self.get_recipe(business_id=business_id, recipe_id=recipe_id)
        update: Dict[str, Any] = {}
        if payload.get("name") is not None:
            new_name = payload["name"].strip()
            dup = await self.repo.get_by_name(business_id=business_id, name=new_name)
            if dup and dup["id"] != recipe_id:
                raise RecipeConflictError(new_name)
            update["name"] = new_name
        if "foodItemId" in payload:
            update["foodItemId"] = payload.get("foodItemId") or None
        if payload.get("ingredients") is not None:
            await self._validate_ingredients(business_id=business_id, ingredients=payload["ingredients"])
            update["ingredients"] = payload["ingredients"]
        if payload.get("preparationSteps") is not None:
            update["preparationSteps"] = payload["preparationSteps"]
        if payload.get("servingSize") is not None:
            update["servingSize"] = payload["servingSize"]
        item = await self.repo.update(business_id=business_id, recipe_id=recipe_id, payload=update)
        if not item:
            raise RecipeNotFoundError(recipe_id)
        # Same auto-link on update: if the recipe was previously unlinked
        # and is now being pointed at a fresh food item (or a food item
        # whose assignedStores is still empty), back-fill with the
        # business's active stores.
        new_food_id = payload.get("foodItemId")
        if new_food_id:
            await self._auto_link_food_to_business_stores(
                business_id=business_id, food_id=str(new_food_id)
            )
        await sync_service.publish(SyncEvent(
            entity="recipe", action="updated", businessId=business_id,
            recordId=recipe_id, payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def _auto_link_food_to_business_stores(
        self, *, business_id: str, food_id: str
    ) -> None:
        """If a food item has no assignedStores, populate it with the
        business's active stores. Idempotent and curates-only-on-empty —
        never touches a food item the admin has explicitly curated."""
        food = await self.food.get(business_id=business_id, food_id=food_id)
        if not food:
            return  # Food item missing — leave it; admin can re-link.
        existing = food.get("assignedStores") or []
        if existing:
            return  # Already curated by the admin; honour their choice.
        stores = await self.stores.list(business_id=business_id)
        active_store_ids = [
            str(s.get("id"))
            for s in stores
            if s.get("isActive", True) and s.get("status") != "CLOSED"
        ]
        if not active_store_ids:
            return  # No stores in the business yet — leave it empty.
        await self.food.update(
            business_id=business_id, food_id=food_id,
            payload={"assignedStores": active_store_ids},
        )

    async def delete_recipe(self, *, business_id: str, recipe_id: str, actor_user_id: str) -> None:
        ok = await self.repo.delete(business_id=business_id, recipe_id=recipe_id)
        if not ok:
            raise RecipeNotFoundError(recipe_id)
        await sync_service.publish(SyncEvent(
            entity="recipe", action="deleted", businessId=business_id,
            recordId=recipe_id, payload=None, actorUserId=actor_user_id,
        ))

    async def compute_cost(self, *, business_id: str, recipe_id: str) -> Dict[str, Any]:
        recipe = await self.get_recipe(business_id=business_id, recipe_id=recipe_id)
        line_items = []
        total = 0.0
        for line in recipe.get("ingredients") or []:
            ing_id = line.get("ingredientId")
            qty = float(line.get("quantity") or 0)
            ing = await self.ingredients.get(business_id=business_id, ingredient_id=ing_id)
            if not ing:
                raise IngredientNotFoundForRecipeError(ing_id)
            unit_cost = float(ing.get("costPerUnit") or ing.get("averageCost") or 0)
            line_cost = unit_cost * qty
            total += line_cost
            line_items.append({"ingredientId": ing_id, "name": ing.get("name"), "quantity": qty, "unitCost": unit_cost, "lineCost": round(line_cost, 4)})
        return {"recipeId": recipe_id, "currency": "USD", "totalCost": round(total, 4), "lines": line_items}

    async def _validate_ingredients(self, *, business_id: str, ingredients: List[Dict[str, Any]]) -> None:
        for line in ingredients:
            ing_id = line.get("ingredientId")
            if not ing_id:
                raise IngredientNotFoundForRecipeError("missing-id")
            ing = await self.ingredients.get(business_id=business_id, ingredient_id=ing_id)
            if not ing:
                raise IngredientNotFoundForRecipeError(ing_id)
