from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import ConflictError, NotFoundError
from app.core.response import success_payload
from app.database.client import get_database_dependency
from app.dependencies.auth import CurrentUser, get_current_user
from app.dependencies.rbac import require_role
from app.schemas.allocation import (
    AllocationCreateRequest,
    AllocationUpdateRequest,
)
from app.services.allocation_service import AllocationError, AllocationService


router = APIRouter(prefix="/allocations", tags=["allocations"])


def _service(db: AsyncIOMotorDatabase = Depends(get_database_dependency)) -> AllocationService:
    return AllocationService(db)


@router.post("", status_code=201)
async def create_allocation(
    body: AllocationCreateRequest,
    current_user: CurrentUser = Depends(require_role(["MANAGER", "OWNER", "ADMIN"])),
    service: AllocationService = Depends(_service),
):
    try:
        result = await service.create_allocation(
            business_id=current_user.businessId or "",
            store_id=body.storeId,
            food_id=body.foodItemId,
            quantity=body.quantity,
            created_by=current_user.userId,
            date=body.date,
            notes=body.notes,
        )
    except AllocationError as exc:
        # Map "no recipe" / "no food" to 404; "insufficient stock" to 409
        msg = str(exc)
        if "not found" in msg.lower():
            raise NotFoundError("ALLOCATION_TARGET_NOT_FOUND", msg)
        raise ConflictError("ALLOCATION_FAILED", msg)
    return success_payload(result, message=f"Allocated {body.quantity} × food item to store")


@router.get("")
async def list_allocations(
    storeId: Annotated[Optional[str], Query()] = None,
    foodId: Annotated[Optional[str], Query()] = None,
    start: Annotated[Optional[str], Query()] = None,
    end: Annotated[Optional[str], Query()] = None,
    status: Annotated[Optional[str], Query()] = None,
    limit: Annotated[int, Query(le=500)] = 200,
    current_user: CurrentUser = Depends(get_current_user),
    service: AllocationService = Depends(_service),
):
    rows = await service.list_all(
        business_id=current_user.businessId or "",
        store_id=storeId,
        food_id=foodId,
        start_date=start,
        end_date=end,
        status=status,
        limit=limit,
    )
    return success_payload(rows)


@router.get("/store/{store_id}/summary")
async def store_summary(
    store_id: str,
    start: Annotated[Optional[str], Query()] = None,
    end: Annotated[Optional[str], Query()] = None,
    current_user: CurrentUser = Depends(get_current_user),
    service: AllocationService = Depends(_service),
):
    payload = await service.list_for_store(
        business_id=current_user.businessId or "",
        store_id=store_id,
        start_date=start,
        end_date=end,
    )
    return success_payload(payload)


@router.get("/stale-active")
async def stale_active(
    current_user: CurrentUser = Depends(get_current_user),
    service: AllocationService = Depends(_service),
):
    """ACTIVE allocations whose ``date`` is strictly before today.

    Frontend uses this to surface an "open stock from previous day" nudge
    on the admin dashboard, prompting the owner to reclaim before today
    starts. Data is never auto-deleted — workers must reclaim (which
    refunds unused ingredients) or reverse allocations explicitly.
    """
    payload = await service.list_stale_active(
        business_id=current_user.businessId or "",
    )
    return success_payload(payload)


@router.get("/{allocation_id}")
async def get_allocation(
    allocation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: AllocationService = Depends(_service),
):
    row = await service.allocations.get_by_id(
        business_id=current_user.businessId or "", allocation_id=allocation_id
    )
    if not row:
        raise NotFoundError("ALLOCATION_NOT_FOUND", "Allocation not found")
    return success_payload(row)


@router.put("/{allocation_id}")
async def update_allocation(
    allocation_id: str,
    body: AllocationUpdateRequest,
    current_user: CurrentUser = Depends(require_role(["MANAGER", "OWNER", "ADMIN"])),
    service: AllocationService = Depends(_service),
):
    try:
        result = await service.update_allocation(
            business_id=current_user.businessId or "",
            allocation_id=allocation_id,
            actor_user_id=current_user.userId or "",
            new_quantity=body.quantity,
            notes=body.notes,
        )
    except AllocationError as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            raise NotFoundError("ALLOCATION_NOT_FOUND", msg)
        raise ConflictError("ALLOCATION_UPDATE_FAILED", msg)
    return success_payload(result, message="Allocation updated")


@router.delete("/{allocation_id}", status_code=200)
async def revert_allocation(
    allocation_id: str,
    current_user: CurrentUser = Depends(require_role(["MANAGER", "OWNER", "ADMIN"])),
    service: AllocationService = Depends(_service),
):
    try:
        result = await service.revert_allocation(
            business_id=current_user.businessId or "",
            allocation_id=allocation_id,
            reversed_by=current_user.userId,
        )
    except AllocationError as exc:
        raise NotFoundError("ALLOCATION_NOT_FOUND", str(exc))
    return success_payload(result, message="Allocation reversed — stock refunded")


@router.post("/{allocation_id}/reclaim", status_code=200)
async def reclaim_remaining(
    allocation_id: str,
    current_user: CurrentUser = Depends(require_role(["MANAGER", "OWNER", "ADMIN"])),
    service: AllocationService = Depends(_service),
):
    """Reclaim the unsold leftover ingredients from an active allocation.

    Refunds per-ingredient shares of ``remaining = allocated - sold`` back to
    the master pool and marks the allocation as ``RECLAIMED``. Idempotent.
    """
    try:
        result = await service.reclaim_remaining(
            business_id=current_user.businessId or "",
            allocation_id=allocation_id,
            reclaimed_by=current_user.userId,
        )
    except AllocationError as exc:
        raise NotFoundError("ALLOCATION_NOT_FOUND", str(exc))
    action = result.pop("_reclaimAction", None)
    if action == "reclaimed":
        return success_payload(
            result,
            message=(
                f"Reclaimed {result.get('reclaimedRemaining', 0):g} unsold unit(s) — "
                f"stock refunded to master pool"
            ),
        )
    if action == "noop-already-claimed":
        return success_payload(result, message="Allocation was already reclaimed")
    return success_payload(result, message="Nothing left to reclaim")