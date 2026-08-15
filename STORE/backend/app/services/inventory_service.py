from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.repositories.ingredient_repository import IngredientRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


class IngredientNotFoundError(Exception):
    pass


class IngredientConflictError(Exception):
    pass


class InventoryService:
    def __init__(self, db: Any) -> None:
        self.repo = IngredientRepository(db)

    async def list_ingredients(self, *, business_id: str, category: Optional[str] = None, low_stock: Optional[bool] = None) -> List[Dict[str, Any]]:
        return await self.repo.list(business_id=business_id, category=category, low_stock=low_stock)

    async def get_ingredient(self, *, business_id: str, ingredient_id: str) -> Dict[str, Any]:
        item = await self.repo.get(business_id=business_id, ingredient_id=ingredient_id)
        if not item:
            raise IngredientNotFoundError(ingredient_id)
        return item

    async def create_ingredient(self, *, business_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        name = (payload.get("name") or "").strip()
        if not name:
            raise ValueError("name is required")
        existing = await self.repo.get_by_name(business_id=business_id, name=name)
        if existing:
            raise IngredientConflictError(name)
        doc = {
            "name": name,
            "unit": payload.get("unit", "pcs"),
            "category": payload.get("category", "other"),
            "costPerUnit": float(payload.get("costPerUnit", 0) or 0),
            "minimumStock": float(payload.get("minimumStock", 0) or 0),
            "currentStock": float(payload.get("currentStock", 0) or 0),
            "supplier": payload.get("supplier"),
            "notes": payload.get("notes"),
        }
        item = await self.repo.create(business_id=business_id, payload=doc)
        await sync_service.publish(SyncEvent(
            entity="inventory", action="created", businessId=business_id,
            recordId=item["id"], payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def update_ingredient(self, *, business_id: str, ingredient_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        await self.get_ingredient(business_id=business_id, ingredient_id=ingredient_id)
        update = {k: v for k, v in payload.items() if k in {"name", "unit", "category", "costPerUnit", "minimumStock", "currentStock", "supplier", "notes"} and v is not None}
        if "name" in update:
            update["name"] = update["name"].strip()
            dup = await self.repo.get_by_name(business_id=business_id, name=update["name"])
            if dup and dup["id"] != ingredient_id:
                raise IngredientConflictError(update["name"])
        item = await self.repo.update(business_id=business_id, ingredient_id=ingredient_id, payload=update)
        if not item:
            raise IngredientNotFoundError(ingredient_id)
        await sync_service.publish(SyncEvent(
            entity="inventory", action="updated", businessId=business_id,
            recordId=ingredient_id, payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def delete_ingredient(self, *, business_id: str, ingredient_id: str, actor_user_id: str) -> None:
        ok = await self.repo.delete(business_id=business_id, ingredient_id=ingredient_id)
        if not ok:
            raise IngredientNotFoundError(ingredient_id)
        await sync_service.publish(SyncEvent(
            entity="inventory", action="deleted", businessId=business_id,
            recordId=ingredient_id, payload=None, actorUserId=actor_user_id,
        ))

    async def low_stock(self, *, business_id: str) -> List[Dict[str, Any]]:
        return await self.repo.low_stock(business_id=business_id)
