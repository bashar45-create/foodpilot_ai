from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Query

from app.dependencies.auth import get_current_user
from app.services.sale_service import SaleService, InsufficientStockError, FoodNotFoundError, SaleError
from app.database.client import get_database

router = APIRouter()


def _bid(user) -> str:
    return getattr(user, "businessId", None) or "business-default"


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_sale(payload: dict, current_user=Depends(get_current_user), db=Depends(get_database)):
    service = SaleService(db)
    try:
        sale = await service.record_sale(
            business_id=_bid(current_user),
            store_id=payload.get("storeId"),
            food_item_id=payload.get("foodItemId"),
            quantity=payload.get("quantity", 1),
            channel=payload.get("channel", "POS"),
            served_by=getattr(current_user, "id", None),
            actor_user_id=getattr(current_user, "userId", None) or "",
        )
    except InsufficientStockError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": exc.code, "message": str(exc)})
    except FoodNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": exc.code, "message": str(exc)})
    except SaleError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": exc.code, "message": str(exc)})
    return {"success": True, "data": sale}


@router.get("")
async def list_sales(
    storeId: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    current_user=Depends(get_current_user),
    db=Depends(get_database),
):
    service = SaleService(db)
    items = await service.list_sales(business_id=_bid(current_user), store_id=storeId, limit=limit)
    return {"success": True, "data": items}


@router.get("/{sale_id}")
async def get_sale(sale_id: str, current_user=Depends(get_current_user), db=Depends(get_database)):
    service = SaleService(db)
    sale = await service.get_sale(business_id=_bid(current_user), sale_id=sale_id)
    if not sale:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    return {"success": True, "data": sale}
