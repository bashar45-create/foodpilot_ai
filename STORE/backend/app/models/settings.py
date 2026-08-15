from __future__ import annotations

from typing import Any

from app.models.base import TimestampedDocument


class SettingsDocument(TimestampedDocument):
    businessId: str
    currency: str = "USD"
    timezone: str = "UTC"
    language: str = "en"
    notificationSettings: dict[str, Any] = {}
    aiSettings: dict[str, Any] = {}
    theme: dict[str, Any] = {}
    taxRate: float = 0
    workingHours: dict[str, Any] = {}
