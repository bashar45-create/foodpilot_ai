from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.models.base import TimestampedDocument


AttendanceStatus = Literal["PRESENT", "LATE", "ABSENT", "LEAVE"]


class AttendanceDocument(TimestampedDocument):
    businessId: str
    userId: str
    storeId: str
    clockIn: datetime | None = None
    clockOut: datetime | None = None
    date: str
    status: AttendanceStatus = "PRESENT"
