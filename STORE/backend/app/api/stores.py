from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi import Query

from app.core.response import success_payload
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.store import StoreCreateRequest, StoreOpenCloseRequest, StoreStatusUpdateRequest, StoreUpdateRequest
from app.services.store_service import StoreService


router = APIRouter(prefix="/stores", tags=["stores"])
service = StoreService()


@router.get("")
async def list_stores(current_user: CurrentUser = Depends(get_current_user)):
    rows = await service.list_stores(business_id=current_user.businessId or "")
    return success_payload(rows, meta={"page": 1, "limit": len(rows), "total": len(rows)})


@router.get("/{store_id}")
async def get_store(store_id: str, current_user: CurrentUser = Depends(get_current_user)):
    row = await service.get_store(business_id=current_user.businessId or "", store_id=store_id)
    return success_payload(row)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_store(payload: StoreCreateRequest, current_user: CurrentUser = Depends(get_current_user)):
    row = await service.create_store(
        business_id=current_user.businessId or "",
        payload=payload.model_dump(exclude_none=True),
        actor_user_id=current_user.userId or "",
    )
    return success_payload(row, message="Store created")


@router.put("/{store_id}")
async def update_store(store_id: str, payload: StoreUpdateRequest, current_user: CurrentUser = Depends(get_current_user)):
    row = await service.update_store(
        business_id=current_user.businessId or "",
        store_id=store_id,
        payload=payload.model_dump(exclude_none=True),
        actor_user_id=current_user.userId or "",
    )
    return success_payload(row, message="Store updated")


@router.patch("/{store_id}/status")
async def change_status(store_id: str, payload: StoreStatusUpdateRequest, current_user: CurrentUser = Depends(get_current_user)):
    # Normalize either `status` (Literal) or `isActive` (bool) into a single
    # `status` string. `isActive=True` maps to "OPEN", `isActive=False` to "CLOSED".
    if payload.status is not None:
        new_status = payload.status
    else:
        new_status = "OPEN" if payload.isActive else "CLOSED"
    row = await service.update_store(
        business_id=current_user.businessId or "",
        store_id=store_id,
        payload={"status": new_status},
        actor_user_id=current_user.userId or "",
    )
    return success_payload(row, message="Store status updated")


@router.get("/{store_id}/analytics")
async def analytics(store_id: str, from_: str | None = Query(default=None, alias="from"), to: str | None = Query(default=None, alias="to")):
    return success_payload({"storeId": store_id, "from": from_, "to": to}, message="Store analytics scaffold")


@router.get("/{store_id}/performance")
async def performance(store_id: str):
    return success_payload({"storeId": store_id}, message="Store performance scaffold")


@router.post("/{store_id}/open")
async def open_store(store_id: str, _: StoreOpenCloseRequest, current_user: CurrentUser = Depends(get_current_user)):
    row = await service.update_store(
        business_id=current_user.businessId or "",
        store_id=store_id,
        payload={"status": "OPEN"},
        actor_user_id=current_user.userId or "",
    )
    return success_payload(row, message="Store opened")


@router.post("/{store_id}/close")
async def close_store(store_id: str, _: StoreOpenCloseRequest, current_user: CurrentUser = Depends(get_current_user)):
    row = await service.update_store(
        business_id=current_user.businessId or "",
        store_id=store_id,
        payload={"status": "CLOSED"},
        actor_user_id=current_user.userId or "",
    )
    return success_payload(row, message="Store closed")


@router.get("/{store_id}/daily-report")
async def daily_report(store_id: str, date: str | None = None):
    return success_payload({"storeId": store_id, "date": date}, message="Daily report scaffold")
