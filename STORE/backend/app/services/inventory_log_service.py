from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.repositories.food_repository import FoodRepository
from app.repositories.ingredient_repository import IngredientRepository
from app.repositories.inventory_log_repository import InventoryLogRepository
from app.repositories.purchase_order_repository import PurchaseOrderRepository
from app.repositories.recipe_repository import RecipeRepository
from app.repositories.store_inventory_repository import StoreInventoryRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


class InventoryLogService:
    """Ledger-backed writes for ingredient stock.

    `inventory_logs` is the immutable source of truth; `ingredients.currentStock`
    is a cached aggregate. Every state-changing operation writes a log entry
    AND updates the cache + weighted-average cost where relevant.
    """

    def __init__(self, db: Any) -> None:
        self.db = db
        self.ingredients = IngredientRepository(db)
        self.logs = InventoryLogRepository(db)
        self.purchase_orders = PurchaseOrderRepository(db)
        # Used by allocate_food (recipe-based allocation).
        self.food = FoodRepository(db)
        self.recipes = RecipeRepository(db)
        self.store_inventory = StoreInventoryRepository(db)

    async def _current_stock(self, *, business_id: str, ingredient_id: str) -> float:
        item = await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id)
        if not item:
            raise LookupError(ingredient_id)
        return float(item.get("currentStock") or 0)

    async def _write_log(
        self,
        *,
        business_id: str,
        ingredient_id: str,
        action: str,
        quantity: float,
        before: float,
        after: float,
        store_id: Optional[str] = None,
        worker_id: Optional[str] = None,
        reference_type: Optional[str] = None,
        reference_id: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        log = await self.logs.insert(
            payload={
                "businessId": business_id,
                "ingredientId": ingredient_id,
                "storeId": store_id,
                "workerId": worker_id,
                "action": action,
                "quantity": quantity,
                "before": before,
                "after": after,
                "referenceType": reference_type,
                "referenceId": reference_id,
                "reason": reason,
            }
        )
        await sync_service.publish(SyncEvent(
            entity="inventory", action="updated", businessId=business_id, storeId=store_id,
            recordId=ingredient_id, payload=None, actorUserId=worker_id or "",
        ))
        return log

    async def purchase(
        self,
        *,
        business_id: str,
        ingredient_id: str,
        quantity: float,
        unit_price: float,
        supplier_id: Optional[str] = None,
        store_id: Optional[str] = None,
        worker_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        item = await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id)
        if not item:
            raise LookupError(ingredient_id)
        before = float(item.get("currentStock") or 0)
        prev_avg = float(item.get("averageCost") or item.get("costPerUnit") or unit_price)
        after = before + quantity
        new_avg = ((prev_avg * before) + (unit_price * quantity)) / after if after else prev_avg

        await self.ingredients.update(
            business_id=business_id,
            ingredient_id=ingredient_id,
            payload={
                "currentStock": after,
                "averageCost": new_avg,
                "costPerUnit": new_avg,
                "purchasePrice": unit_price,
                "lastPurchaseAt": datetime.now(timezone.utc),
            },
        )

        po = await self.purchase_orders.insert(
            payload={
                "businessId": business_id,
                "supplierId": supplier_id,
                "ingredientId": ingredient_id,
                "quantity": quantity,
                "unitPrice": unit_price,
                "totalCost": round(quantity * unit_price, 4),
                "status": "COMPLETED",
                "storeId": store_id,
            }
        )

        log = await self._write_log(
            business_id=business_id,
            ingredient_id=ingredient_id,
            action="PURCHASE",
            quantity=quantity,
            before=before,
            after=after,
            store_id=store_id,
            worker_id=worker_id,
            reference_type="purchase_order",
            reference_id=str(po.get("id", "")),
        )
        return {"ingredient": await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id), "log": log, "purchaseOrder": po}

    async def adjust(
        self,
        *,
        business_id: str,
        ingredient_id: str,
        quantity: float,
        reason: str,
        store_id: Optional[str] = None,
        worker_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        item = await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id)
        if not item:
            raise LookupError(ingredient_id)
        before = float(item.get("currentStock") or 0)
        after = before + quantity
        await self.ingredients.update(
            business_id=business_id,
            ingredient_id=ingredient_id,
            payload={"currentStock": after},
        )
        log = await self._write_log(
            business_id=business_id,
            ingredient_id=ingredient_id,
            action="ADJUSTMENT",
            quantity=quantity,
            before=before,
            after=after,
            store_id=store_id,
            worker_id=worker_id,
            reason=reason,
        )
        return {"ingredient": await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id), "log": log}

    async def transfer(
        self,
        *,
        business_id: str,
        ingredient_id: str,
        from_store_id: str,
        to_store_id: str,
        quantity: float,
        worker_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        item = await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id)
        if not item:
            raise LookupError(ingredient_id)
        before = float(item.get("currentStock") or 0)
        if before < quantity:
            raise ValueError(f"Insufficient stock: have {before}, need {quantity}")
        after = before - quantity
        await self.ingredients.update(
            business_id=business_id,
            ingredient_id=ingredient_id,
            payload={"currentStock": after},
        )
        out_log = await self._write_log(
            business_id=business_id,
            ingredient_id=ingredient_id,
            action="TRANSFER",
            quantity=-quantity,
            before=before,
            after=after,
            store_id=from_store_id,
            worker_id=worker_id,
            reference_type="transfer_out",
        )
        await self._write_log(
            business_id=business_id,
            ingredient_id=ingredient_id,
            action="TRANSFER",
            quantity=quantity,
            before=after,
            after=after,
            store_id=to_store_id,
            worker_id=worker_id,
            reference_type="transfer_in",
            reference_id=str(out_log.get("id", "")),
        )
        return {"ingredient": await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id), "log": out_log}

    async def allocate(
        self,
        *,
        business_id: str,
        ingredient_id: str,
        store_id: str,
        quantity: float,
        worker_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        item = await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id)
        if not item:
            raise LookupError(ingredient_id)
        before = float(item.get("currentStock") or 0)
        if before < quantity:
            raise ValueError(f"Insufficient stock: have {before}, need {quantity}")
        after = before - quantity
        await self.ingredients.update(
            business_id=business_id,
            ingredient_id=ingredient_id,
            payload={"currentStock": after},
        )
        log = await self._write_log(
            business_id=business_id,
            ingredient_id=ingredient_id,
            action="ALLOCATION",
            quantity=-quantity,
            before=before,
            after=after,
            store_id=store_id,
            worker_id=worker_id,
        )
        return {"ingredient": await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id), "log": log}

    async def return_stock(
        self,
        *,
        business_id: str,
        ingredient_id: str,
        store_id: str,
        quantity: float,
        worker_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        item = await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id)
        if not item:
            raise LookupError(ingredient_id)
        before = float(item.get("currentStock") or 0)
        after = before + quantity
        await self.ingredients.update(
            business_id=business_id,
            ingredient_id=ingredient_id,
            payload={"currentStock": after},
        )
        log = await self._write_log(
            business_id=business_id,
            ingredient_id=ingredient_id,
            action="RETURN",
            quantity=quantity,
            before=before,
            after=after,
            store_id=store_id,
            worker_id=worker_id,
        )
        return {"ingredient": await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id), "log": log}

    async def history(self, *, business_id: str, ingredient_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        return await self.logs.history(business_id=business_id, ingredient_id=ingredient_id, limit=limit)

    # ---------------------------------------------------------------------
    # Recipe-based allocation
    # ---------------------------------------------------------------------

    async def allocate_food(
        self,
        *,
        business_id: str,
        food_id: str,
        store_id: str,
        quantity: float,
        worker_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Allocate ``quantity`` units of a food item to ``store_id`` (legacy path).

        Reads each ingredient's master pool (``ingredients.currentStock``) and
        atomically mirrors the deduction onto ``store_inventory`` via
        ``StoreInventoryService.try_consume_pool``.

        On success, returns ``{storeId, foodId, foodName, quantity, deductions: [...]}``
        where ``deductions`` contains per-ingredient before/after/quantity records.
        """
        if quantity <= 0:
            raise ValueError("quantity must be positive")

        food = await self.food.get(business_id=business_id, food_id=food_id)
        if not food:
            raise LookupError(food_id)

        recipe = await self.recipes.get_active_for_food(business_id=business_id, food_id=food_id)
        if not recipe:
            raise ValueError("No active recipe for food item")
        ingredients_list = recipe.get("ingredients") or []
        if not ingredients_list:
            raise ValueError("Recipe has no ingredient lines")

        # Pre-flight against the master pool.
        from app.services.store_inventory_service import StoreInventoryService
        store_inv = StoreInventoryService(self.db)

        plan: List[Dict[str, Any]] = []
        for line in ingredients_list:
            ing_id = line.get("ingredientId")
            per_unit = float(line.get("quantity") or 0)
            if not ing_id or per_unit <= 0:
                continue
            required = per_unit * float(quantity)
            ing_doc = await self.ingredients.get(business_id=business_id, ingredient_id=ing_id)
            if not ing_doc:
                raise ValueError(f"Ingredient {ing_id} no longer exists")
            pool_before = float(ing_doc.get("currentStock") or 0)
            if pool_before < required:
                raise ValueError(
                    f"Insufficient stock pool for ingredient {ing_id}: "
                    f"have {pool_before}, need {required}. Restock from Inventory first."
                )
            plan.append({
                "ingredientId": ing_id,
                "required": required,
                "before": pool_before,
            })

        if not plan:
            raise ValueError("Recipe has no usable ingredient lines")

        deductions: List[Dict[str, Any]] = []
        used_transaction = False
        for entry in plan:
            result = await store_inv.try_consume_pool(
                business_id=business_id,
                store_id=store_id,
                ingredient_id=entry["ingredientId"],
                amount=entry["required"],
            )
            if not result.get("ok"):
                for done in deductions:
                    await store_inv.refund_pool(
                        business_id=business_id,
                        store_id=store_id,
                        ingredient_id=done["ingredientId"],
                        amount=done["required"],
                    )
                raise ValueError(
                    f"Insufficient stock pool for ingredient {entry['ingredientId']}: "
                    f"have {result.get('poolCurrent', 0)}, need {entry['required']}. "
                    f"Restock from Inventory first."
                )
            if result.get("transactional"):
                used_transaction = True
            deductions.append({
                "ingredientId": entry["ingredientId"],
                "quantity": entry["required"],
                "before": entry["before"],
                "after": result.get("poolAfter"),
            })

        # Best-effort inventory log entries (outside any transaction).
        for d in deductions:
            await self._write_log(
                business_id=business_id,
                ingredient_id=d["ingredientId"],
                action="ALLOCATION",
                quantity=-d["quantity"],
                before=d["before"],
                after=d["after"],
                store_id=store_id,
                worker_id=worker_id,
                reference_type="food_allocation",
                reference_id=str(food_id),
                reason=f"Allocated {quantity}× {food.get('name') or food_id}",
            )

        return {
            "storeId": store_id,
            "foodId": food_id,
            "foodName": food.get("name"),
            "quantity": int(quantity),
            "transactional": used_transaction,
            "deductions": deductions,
        }
