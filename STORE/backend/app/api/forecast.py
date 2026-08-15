from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies.auth import get_current_user
from app.services.forecast_service import ForecastService
from app.database.client import get_database

router = APIRouter()


def _bid(user) -> str:
    return getattr(user, "businessId", None) or "business-default"


@router.get("/daily")
async def daily_forecast(days: int = Query(default=7, ge=1, le=60), current_user=Depends(get_current_user), db=Depends(get_database)):
    """Legacy per-food moving-average forecast. Use ``/projected-daily`` instead."""
    service = ForecastService(db)
    return {"success": True, "data": await service.daily_forecast(business_id=_bid(current_user), days=days)}


@router.get("/projected-daily")
async def projected_daily(
    days: int = Query(default=7, ge=1, le=30),
    top: int = Query(default=10, ge=1, le=50),
    storeId: str | None = Query(default=None),
    current_user=Depends(get_current_user),
    db=Depends(get_database),
):
    """Per-day forecast for the next ``days`` days (consumed by the dashboard 7-day chart)."""
    service = ForecastService(db)
    return {
        "success": True,
        "data": await service.projected_daily(
            business_id=_bid(current_user), days=days, top_n=top, store_id=storeId
        ),
    }