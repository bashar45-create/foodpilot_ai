from __future__ import annotations

from typing import Any

from app.models.base import TimestampedDocument


class DailyReportDocument(TimestampedDocument):
    businessId: str
    storeId: str
    date: str
    summary: dict[str, Any] = {}
    generatedAt: str | None = None
