from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal

from app.repositories.attendance_repository import AttendanceRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


AttendanceStatus = Literal["PRESENT", "LATE", "ABSENT", "LEAVE"]


def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class AttendanceService:
    """Business logic for daily attendance tracking."""

    def __init__(self, db: Any | None) -> None:
        self.repo = AttendanceRepository(db)

    async def clock_in(
        self,
        *,
        business_id: str,
        user_id: str,
        store_id: str | None,
        date: str | None = None,
        status: AttendanceStatus = "PRESENT",
    ) -> Dict[str, Any]:
        target_date = date or _today_iso()
        record = await self.repo.upsert_clock_in(
            business_id=business_id,
            user_id=user_id,
            store_id=store_id,
            date=target_date,
            clock_in=_now_utc(),
            status=status,
        )
        await sync_service.publish(SyncEvent(
            entity="attendance", action="updated", businessId=business_id, storeId=store_id,
            recordId=record["id"], payload=record, actorUserId=user_id,
        ))
        return record

    async def clock_out(
        self,
        *,
        business_id: str,
        user_id: str,
        date: str | None = None,
    ) -> Dict[str, Any] | None:
        target_date = date or _today_iso()
        record = await self.repo.set_clock_out(
            business_id=business_id,
            user_id=user_id,
            date=target_date,
            clock_out=_now_utc(),
        )
        if record:
            await sync_service.publish(SyncEvent(
                entity="attendance", action="updated", businessId=business_id, storeId=record.get("storeId"),
                recordId=record["id"], payload=record, actorUserId=user_id,
            ))
        return record

    async def get_today(self, *, business_id: str, user_id: str) -> Dict[str, Any] | None:
        return await self.repo.get_for_day(
            business_id=business_id,
            user_id=user_id,
            date=_today_iso(),
        )

    async def mark_status(
        self,
        *,
        business_id: str,
        user_id: str,
        date: str,
        status: AttendanceStatus,
        store_id: str | None = None,
        note: str | None = None,
        actor_user_id: str = "",
    ) -> Dict[str, Any]:
        record = await self.repo.mark_status(
            business_id=business_id,
            user_id=user_id,
            date=date,
            status=status,
            store_id=store_id,
            note=note,
        )
        await sync_service.publish(SyncEvent(
            entity="attendance", action="updated", businessId=business_id, storeId=store_id,
            recordId=record["id"], payload=record, actorUserId=actor_user_id or user_id,
        ))
        return record

    async def history_for_user(
        self,
        *,
        business_id: str,
        user_id: str,
        start_date: str,
        end_date: str,
    ) -> List[Dict[str, Any]]:
        return await self.repo.list_for_user(
            business_id=business_id,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
        )

    async def overview(
        self,
        *,
        business_id: str,
        start_date: str,
        end_date: str,
    ) -> Dict[str, List[Dict[str, Any]]]:
        return await self.repo.list_overview(
            business_id=business_id,
            start_date=start_date,
            end_date=end_date,
        )


__all__ = ["AttendanceService", "AttendanceStatus"]