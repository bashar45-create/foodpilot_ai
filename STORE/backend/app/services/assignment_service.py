from __future__ import annotations

from datetime import date as date_cls
from typing import Any, Dict, List, Optional

from app.repositories.assignment_repository import AssignmentRepository
from app.repositories.store_inventory_repository import StoreInventoryRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


class AssignmentService:
    def __init__(self, db: Any) -> None:
        self.repo = AssignmentRepository(db)
        self.inventory = StoreInventoryRepository(db)

    async def upsert_assignment(self, *, business_id: str, store_id: str, target_date: str, allocations: List[Dict[str, Any]], actor_user_id: str) -> Dict[str, Any]:
        for line in allocations:
            ingredient_id = line.get("ingredientId")
            qty = float(line.get("quantity") or 0)
            if not ingredient_id:
                continue
            await self.inventory.upsert(business_id=business_id, store_id=store_id, ingredient_id=ingredient_id, allocated=qty)
        item = await self.repo.upsert(business_id=business_id, store_id=store_id, date=target_date, allocations=allocations)
        await sync_service.publish(SyncEvent(
            entity="assignment", action="updated", businessId=business_id, storeId=store_id,
            recordId=item["id"], payload=item, actorUserId=actor_user_id,
        ))
        return item

    async def get_for_date(self, *, business_id: str, store_id: str, target_date: str) -> Dict[str, Any]:
        return await self.repo.get_by_date(business_id=business_id, store_id=store_id, date=target_date)

    async def list_recent(self, *, business_id: str, store_id: str) -> List[Dict[str, Any]]:
        return await self.repo.list_by_store(business_id=business_id, store_id=store_id)
