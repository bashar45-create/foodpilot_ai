from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import get_current_user
from app.services.store_inventory_service import StoreInventoryService
from app.database.client import get_database

router = APIRouter()


def _bid(user) -> str:
    return getattr(user, "businessId", None) or "business-default"


@router.get("")
async def list_for_store(storeId: str, current_user=Depends(get_current_user), db=Depends(get_database)):
    service = StoreInventoryService(db)
    return {"success": True, "data": await service.list_for_store(business_id=_bid(current_user), store_id=storeId)}


@router.put("")
async def set_stock(payload: dict, current_user=Depends(get_current_user), db=Depends(get_database)):
    store_id = payload.get("storeId")
    ingredient_id = payload.get("ingredientId")
    quantity = payload.get("quantity")
    minimum_stock = payload.get("minimumStock")
    if not store_id or not ingredient_id or quantity is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PAYLOAD", "message": "storeId, ingredientId, quantity are required"},
        )
    service = StoreInventoryService(db)
    result = await service.set_stock(
        business_id=_bid(current_user), store_id=store_id, ingredient_id=ingredient_id, quantity=float(quantity), minimumStock=minimum_stock
    )
    return {"success": True, "data": result}


@router.get("/low-stock")
async def low_stock(storeId: str, current_user=Depends(get_current_user), db=Depends(get_database)):
    service = StoreInventoryService(db)
    return {"success": True, "data": await service.list_low_stock(business_id=_bid(current_user), store_id=storeId)}


@router.get("/needs-today")
async def needs_today(storeId: str, current_user=Depends(get_current_user), db=Depends(get_database)):
    """Aggregate today's active-allocation ingredient requirements for a store.

    The mobile Stock page calls this so workers see only the ingredients
    needed to make today's allocated food — not the master pool or stale
    shelf rows. Each row is enriched with ``storeHas`` (what's already on
    the shelf) and ``shortfall`` (what's still needed) for quick scanning.
    """
    service = StoreInventoryService(db)
    return {"success": True, "data": await service.needs_today(business_id=_bid(current_user), store_id=storeId)}
