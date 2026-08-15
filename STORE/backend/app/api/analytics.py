from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.core.exceptions import AppException
from app.core.response import success_payload
from app.database.client import get_database
from app.dependencies.auth import CurrentUser, get_current_user
from app.services.analytics_service import AnalyticsService


router = APIRouter(prefix="/analytics")


def _bid(user) -> str:
    return getattr(user, "businessId", None) or "business-default"


def _service(db=Depends(get_database)) -> AnalyticsService:
    return AnalyticsService(db)


# -----------------------------------------------------------------------------
# Dashboard (existing)
# -----------------------------------------------------------------------------

@router.get("/dashboard")
async def dashboard(
    storeId: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    return success_payload(await svc.dashboard(business_id=_bid(current_user), store_id=storeId))


@router.get("/low-stock")
async def low_stock(
    storeId: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    """Merged low-stock view: master pool + per-store shelf, enriched with cost."""
    return success_payload(
        await svc.low_stock(
            business_id=_bid(current_user),
            store_id=storeId,
            limit=limit,
        )
    )


# -----------------------------------------------------------------------------
# Revenue
# -----------------------------------------------------------------------------

@router.get("/revenue")
async def revenue(
    storeId: str | None = Query(default=None),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    groupBy: str = Query(default="day"),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    return success_payload(
        await svc.revenue(
            business_id=_bid(current_user),
            store_id=storeId,
            start=from_,
            end=to,
            group_by=groupBy,
        )
    )


# -----------------------------------------------------------------------------
# Profit
# -----------------------------------------------------------------------------

@router.get("/profit")
async def profit(
    storeId: str | None = Query(default=None),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    return success_payload(
        await svc.profit(business_id=_bid(current_user), store_id=storeId, start=from_, end=to)
    )


# -----------------------------------------------------------------------------
# Inventory (turnover, valuation, waste %)
# -----------------------------------------------------------------------------

@router.get("/inventory")
async def inventory_analytics(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    return success_payload(
        await svc.inventory(business_id=_bid(current_user), start=from_, end=to)
    )


# -----------------------------------------------------------------------------
# Employees (productivity ranking)
# -----------------------------------------------------------------------------

@router.get("/employees")
async def employees(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    return success_payload(
        await svc.employees(business_id=_bid(current_user), start=from_, end=to, limit=limit)
    )


# -----------------------------------------------------------------------------
# Stores (comparison)
# -----------------------------------------------------------------------------

@router.get("/stores")
async def stores(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    return success_payload(
        await svc.stores(business_id=_bid(current_user), start=from_, end=to)
    )


# -----------------------------------------------------------------------------
# Per-store detail (one round-trip for the stores-page drawer)
# -----------------------------------------------------------------------------

@router.get("/store-summary")
async def store_summary(
    storeId: str = Query(..., min_length=1),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    return success_payload(
        await svc.get_store_summary(business_id=_bid(current_user), store_id=storeId)
    )


# -----------------------------------------------------------------------------
# Food (top sellers / low performers)
# -----------------------------------------------------------------------------

@router.get("/food")
async def food(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    top: int = Query(default=10, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    return success_payload(
        await svc.food(business_id=_bid(current_user), start=from_, end=to, top_n=top)
    )


# -----------------------------------------------------------------------------
# Export (CSV only for now)
# -----------------------------------------------------------------------------

@router.get("/export")
async def export_report(
    type: str = Query(..., pattern="^(csv|pdf)$"),
    report: str = Query(..., min_length=1),
    storeId: str | None = Query(default=None),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    groupBy: str = Query(default="day"),
    current_user: CurrentUser = Depends(get_current_user),
    svc: AnalyticsService = Depends(_service),
):
    """Download a CSV of the chosen report. PDF is not implemented yet."""
    if type == "pdf":
        raise AppException(
            code="PDF_NOT_IMPLEMENTED",
            message="PDF export is not yet supported. Use type=csv.",
            status_code=501,
        )

    data = await svc.build_report(
        business_id=_bid(current_user),
        name=report,
        store_id=storeId,
        start=from_,
        end=to,
        group_by=groupBy,
    )
    if not data.get("headers") and data.get("error"):
        raise AppException(code="UNKNOWN_REPORT", message=data["error"], status_code=400)

    csv_text = AnalyticsService.to_csv(headers=data["headers"], rows=data["rows"])
    safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in report)
    filename = f"analytics_{safe_name}_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )