from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import get_current_user
from app.services.assignment_service import AssignmentService
from app.database.client import get_database

router = APIRouter()


def _bid(user) -> str:
    return getattr(user, "businessId", None) or "business-default"


@router.put("/daily")
async def upsert_assignment(payload: dict, current_user=Depends(get_current_user), db=Depends(get_database)):
    store_id = payload.get("storeId")
    target_date = payload.get("date")
    allocations = payload.get("allocations") or []
    if not store_id or not target_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PAYLOAD", "message": "storeId and date are required"},
        )
    service = AssignmentService(db)
    result = await service.upsert_assignment(
        business_id=_bid(current_user), store_id=store_id, target_date=target_date, allocations=allocations,
        actor_user_id=getattr(current_user, "userId", None) or "",
    )
    return {"success": True, "data": result}


@router.get("/daily")
async def get_assignment(date: str, storeId: str, current_user=Depends(get_current_user), db=Depends(get_database)):
    service = AssignmentService(db)
    result = await service.get_for_date(business_id=_bid(current_user), store_id=storeId, target_date=date)
    return {"success": True, "data": result or {"storeId": storeId, "date": date, "allocations": []}}


@router.get("/recent")
async def list_recent(storeId: str, current_user=Depends(get_current_user), db=Depends(get_database)):
    service = AssignmentService(db)
    return {"success": True, "data": await service.list_recent(business_id=_bid(current_user), store_id=storeId)}
