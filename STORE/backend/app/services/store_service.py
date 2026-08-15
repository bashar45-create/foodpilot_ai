from __future__ import annotations

from app.core.exceptions import NotFoundError
from app.database.client import get_database
from app.repositories.store_repository import StoreRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


class StoreService:
    def __init__(self) -> None:
        self.repository = StoreRepository(get_database())

    async def list_stores(self, *, business_id: str) -> list[dict]:
        return await self.repository.list(business_id=business_id)

    async def get_store(self, *, business_id: str, store_id: str) -> dict:
        store = await self.repository.get(business_id=business_id, store_id=store_id)
        if not store:
            raise NotFoundError(code="STORE_NOT_FOUND", message="Store not found")
        return store

    async def create_store(self, *, business_id: str, payload: dict, actor_user_id: str) -> dict:
        # Default the store type so legacy frontends that omit it still get a
        # valid value. The repo already fills in `status`/`isActive`/`timestamps`.
        if not payload.get("type"):
            payload = {**payload, "type": "RETAIL"}
        store = await self.repository.create(business_id=business_id, payload=payload)
        await sync_service.publish(SyncEvent(
            entity="store", action="created", businessId=business_id, storeId=None,
            recordId=store["id"], payload=store, actorUserId=actor_user_id,
        ))
        return store

    async def update_store(self, *, business_id: str, store_id: str, payload: dict, actor_user_id: str) -> dict:
        store = await self.repository.update(business_id=business_id, store_id=store_id, payload=payload)
        if not store:
            raise NotFoundError(code="STORE_NOT_FOUND", message="Store not found")
        await sync_service.publish(SyncEvent(
            entity="store", action="updated", businessId=business_id, storeId=None,
            recordId=store_id, payload=store, actorUserId=actor_user_id,
        ))
        return store
