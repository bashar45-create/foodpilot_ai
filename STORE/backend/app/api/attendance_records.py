from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.response import success_payload
from app.database.client import get_database
from app.dependencies.auth import get_current_user
from app.services.attendance_service import AttendanceService


router = APIRouter(prefix="/attendance")


def _bid(user) -> str:
    return getattr(user, "businessId", None) or "business-default"


def _resolve_window(start: str | None, end: str | None, *, default_days: int = 30) -> tuple[str, str]:
    if end is None:
        end = date.today().strftime("%Y-%m-%d")
    if start is None:
        start = (date.today() - timedelta(days=default_days - 1)).strftime("%Y-%m-%d")
    return start, end


@router.get("/today")
async def today(current_user=Depends(get_current_user), db=Depends(get_database)):
    """Return today's attendance record for the calling user (if any)."""
    service = AttendanceService(db)
    record = await service.get_today(business_id=_bid(current_user), user_id=current_user.userId or "")
    return success_payload(record or {"status": "ABSENT", "clockIn": None, "clockOut": None})


@router.post("/clock-in")
async def clock_in(
    payload: dict,
    current_user=Depends(get_current_user),
    db=Depends(get_database),
):
    """Worker clock-in for the current day. Idempotent — second call updates existing record."""
    service = AttendanceService(db)
    store_id = payload.get("storeId") or getattr(current_user, "assignedStore", None)
    record = await service.clock_in(
        business_id=_bid(current_user),
        user_id=current_user.userId or "",
        store_id=store_id,
        status="PRESENT",
    )
    return success_payload(record, message="Clocked in")


@router.post("/clock-out")
async def clock_out(
    payload: dict | None = None,
    current_user=Depends(get_current_user),
    db=Depends(get_database),
):
    """Worker clock-out for the current day."""
    service = AttendanceService(db)
    record = await service.clock_out(
        business_id=_bid(current_user),
        user_id=current_user.userId or "",
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NOT_CLOCKED_IN", "message": "No clock-in recorded for today"},
        )
    return success_payload(record, message="Clocked out")


@router.get("/employee/{user_id}")
async def history_for_employee(
    user_id: str,
    start: Annotated[str | None, Query(description="Inclusive start date YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(description="Inclusive end date YYYY-MM-DD")] = None,
    current_user=Depends(get_current_user),
    db=Depends(get_database),
):
    """Admin/manager view of one employee's attendance over a date range."""
    start, end = _resolve_window(start, end, default_days=30)
    service = AttendanceService(db)
    history = await service.history_for_user(
        business_id=_bid(current_user),
        user_id=user_id,
        start_date=start,
        end_date=end,
    )
    return success_payload({"userId": user_id, "start": start, "end": end, "records": history})


@router.get("/overview")
async def overview(
    start: Annotated[str | None, Query()] = None,
    end: Annotated[str | None, Query()] = None,
    current_user=Depends(get_current_user),
    db=Depends(get_database),
):
    """All employees' attendance for the range, grouped by userId."""
    start, end = _resolve_window(start, end, default_days=30)
    service = AttendanceService(db)
    grouped = await service.overview(
        business_id=_bid(current_user),
        start_date=start,
        end_date=end,
    )
    return success_payload({"start": start, "end": end, "byUser": grouped})


@router.post("/employee/{user_id}/mark")
async def mark(
    user_id: str,
    payload: dict,
    current_user=Depends(get_current_user),
    db=Depends(get_database),
):
    """Admin override — set status for a specific date."""
    target_date = payload.get("date")
    target_status: Literal["PRESENT", "LATE", "ABSENT", "LEAVE"] = payload.get("status", "ABSENT")
    if not target_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PAYLOAD", "message": "date is required"},
        )
    service = AttendanceService(db)
    record = await service.mark_status(
        business_id=_bid(current_user),
        user_id=user_id,
        date=target_date,
        status=target_status,
        store_id=payload.get("storeId"),
        note=payload.get("note"),
        actor_user_id=current_user.userId or "",
    )
    return success_payload(record, message="Status updated")