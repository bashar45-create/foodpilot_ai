from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from app.repositories.food_repository import FoodRepository
from app.repositories.recipe_repository import RecipeRepository
from app.repositories.ingredient_repository import IngredientRepository
from app.repositories.allocation_repository import AllocationRepository
from app.repositories.sale_repository import SaleRepository
from app.repositories.store_inventory_repository import StoreInventoryRepository
from app.repositories.notification_repository import NotificationRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


class SaleError(Exception):
    code = "SALE_ERROR"


class FoodNotFoundError(SaleError):
    code = "FOOD_NOT_FOUND"


class InsufficientStockError(SaleError):
    code = "INSUFFICIENT_STOCK"


class SaleService:
    def __init__(self, db: Any) -> None:
        self.db = db
        self.food = FoodRepository(db)
        self.recipes = RecipeRepository(db)
        self.ingredients = IngredientRepository(db)
        self.allocations = AllocationRepository(db)
        self.sales = SaleRepository(db)
        self.store_inventory = StoreInventoryRepository(db)
        self.notifications = NotificationRepository(db)

    async def record_sale(
        self,
        *,
        business_id: str,
        store_id: str,
        food_item_id: str,
        quantity: float,
        channel: str = "POS",
        served_by: str | None = None,
        actor_user_id: str = "",
    ) -> Dict[str, Any]:
        food = await self.food.get(business_id=business_id, food_id=food_item_id)
        if not food:
            raise FoodNotFoundError("Food item not found")
        if (food.get("status") or "ACTIVE").upper() != "ACTIVE":
            raise SaleError("Food item is not active")

        recipe_id = food.get("recipeId")
        if not recipe_id:
            raise SaleError("Food item has no recipe")
        recipe = await self.recipes.get(business_id=business_id, recipe_id=recipe_id)
        if not recipe:
            raise SaleError("Recipe not found")

        recipe_lines = recipe.get("ingredients") or []
        if not recipe_lines:
            raise SaleError("Recipe has no ingredients")

        ingredient_lookup = {}
        for line in recipe_lines:
            ing = await self.ingredients.get(business_id=business_id, ingredient_id=line["ingredientId"])
            if ing:
                ingredient_lookup[line["ingredientId"]] = ing

        plan: List[Dict[str, Any]] = []
        for line in recipe_lines:
            ing = ingredient_lookup.get(line["ingredientId"])
            if not ing:
                continue
            line_qty = float(line.get("quantity") or 0) * float(quantity)
            if line_qty <= 0:
                continue
            current = await self.store_inventory.get_one(business_id=business_id, store_id=store_id, ingredient_id=line["ingredientId"])
            plan.append({
                "ingredientId": line["ingredientId"],
                "name": ing.get("name"),
                "required": line_qty,
                "unit": ing.get("unit") or line.get("unit"),
                "currentQuantity": (current or {}).get("quantity", 0),
            })

        decremented: List[Dict[str, Any]] = []
        for entry in plan:
            result = await self.store_inventory.atomic_decrement(
                business_id=business_id, store_id=store_id, ingredient_id=entry["ingredientId"], amount=entry["required"]
            )
            if not result.get("ok"):
                for prev in decremented:
                    await self.store_inventory.atomic_decrement(
                        business_id=business_id, store_id=store_id, ingredient_id=prev["ingredientId"], amount=-prev["required"]
                    )
                    # Roll back any pool decrement we made for the previous ingredient
                    try:
                        await self.ingredients.increment_pool(
                            business_id=business_id,
                            ingredient_id=prev["ingredientId"],
                            amount=prev["required"],
                        )
                    except Exception:
                        pass
                current_doc = result.get("current") or {}
                current_qty = current_doc.get("quantity") if isinstance(current_doc, dict) else None
                if current_qty is None:
                    current_qty = entry.get("currentQuantity", 0)
                raise InsufficientStockError(
                    f"Insufficient stock for {entry['name']}: have {current_qty}, need {entry['required']}"
                )
            # Mirror decrement onto the master pool so ingredients.currentStock stays in sync
            try:
                await self.ingredients.decrement_pool(
                    business_id=business_id,
                    ingredient_id=entry["ingredientId"],
                    amount=entry["required"],
                )
            except Exception:
                # Pool sync is best-effort: if the pool was somehow empty, the
                # store-side deduction already succeeded. Don't block the sale.
                pass
            decremented.append(entry)

        unit_price = float(food.get("price") or 0)
        total_price = round(unit_price * float(quantity), 2)
        cost_per_unit = float(food.get("cost") or 0)
        total_cost = round(cost_per_unit * float(quantity), 2)

        # FIFO-consume from the oldest ACTIVE allocation(s) at this store+food
        # so per-allocation "sold" / "remaining" stays consistent across the day.
        # If FIFO can't absorb the whole sale, the remainder is still sold (real
        # ingredient stock permits it), but it just won't show up under a
        # specific allocation. We don't fail the sale in that case.
        try:
            await self.allocations.consume_fifo(
                business_id=business_id,
                store_id=store_id,
                food_id=food_item_id,
                quantity=float(quantity),
            )
        except Exception:
            pass

        payload = {
            "businessId": business_id,
            "storeId": store_id,
            "foodItemId": food_item_id,
            "foodName": food.get("name"),
            "quantity": float(quantity),
            "channel": channel,
            "servedBy": served_by,
            "unitPrice": unit_price,
            "totalPrice": total_price,
            "costPerUnit": cost_per_unit,
            "totalCost": total_cost,
            "profit": round(total_price - total_cost, 2),
            "deductions": [
                {k: v for k, v in entry.items() if k in ("ingredientId", "name", "required", "unit")}
                for entry in decremented
            ],
        }
        sale = await self.sales.create(payload)
        await sync_service.publish(SyncEvent(
            entity="sale", action="created", businessId=business_id, storeId=store_id,
            recordId=sale["id"], payload=sale, actorUserId=actor_user_id,
        ))
        for entry in decremented:
            await sync_service.publish(SyncEvent(
                entity="storeInventory", action="updated", businessId=business_id, storeId=store_id,
                recordId=entry["ingredientId"], payload=None, actorUserId=actor_user_id,
            ))
        low_stock_after: List[Dict[str, Any]] = []
        for entry in decremented:
            current = await self.store_inventory.get_one(business_id=business_id, store_id=store_id, ingredient_id=entry["ingredientId"])
            if not current:
                continue
            qty = float(current.get("quantity") or 0)
            minimum = float(current.get("minimumStock") or 0)
            if minimum > 0 and qty <= minimum:
                low_stock_after.append({
                    "ingredientId": entry["ingredientId"],
                    "name": entry["name"],
                    "quantity": qty,
                    "minimumStock": minimum,
                })
        if low_stock_after:
            sale["lowStock"] = low_stock_after
            for entry in low_stock_after:
                try:
                    await self.notifications.create({
                        "businessId": business_id,
                        "storeId": store_id,
                        "type": "LOW_STOCK",
                        "title": f"{entry['name']} is low in store",
                        "message": f"Quantity {entry['quantity']} is at or below minimum {entry['minimumStock']} after a sale.",
                        "ingredientId": entry["ingredientId"],
                        "ingredientName": entry["name"],
                        "quantity": entry["quantity"],
                        "minimumStock": entry["minimumStock"],
                    })
                except Exception:
                    pass
        return sale

    async def list_sales(self, *, business_id: str, store_id: str | None = None, limit: int = 100):
        return await self.sales.list(business_id=business_id, store_id=store_id, limit=limit)

    async def get_sale(self, *, business_id: str, sale_id: str):
        return await self.sales.get(business_id=business_id, sale_id=sale_id)
