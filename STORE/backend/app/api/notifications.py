from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies.auth import get_current_user
from app.repositories.notification_repository import NotificationRepository
from app.database.client import get_database

router = APIRouter(prefix="/notifications")


def _bid(user) -> str:
    return getattr(user, "businessId", None) or "business-default"


@router.get("/")
async def list_notifications(storeId: str | None = Query(default=None), limit: int = Query(default=50, le=200), current_user=Depends(get_current_user), db=Depends(get_database)):
    repo = NotificationRepository(db)
    return {"success": True, "data": await repo.list_recent(business_id=_bid(current_user), store_id=storeId, limit=limit)}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, current_user=Depends(get_current_user), db=Depends(get_database)):
    repo = NotificationRepository(db)
    doc = await repo.mark_read(business_id=_bid(current_user), notification_id=notification_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Notification not found"})
    return {"success": True, "data": doc}
