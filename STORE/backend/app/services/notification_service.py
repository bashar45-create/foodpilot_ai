from __future__ import annotations

from typing import Any

from app.services.base import BaseService


class NotificationService(BaseService):
    async def send(self, user_id: str, notification_type: str, payload: dict[str, Any]) -> None:
        return None

    async def placeholder(self, data: Any = None, *, message: str = "Notification module placeholder") -> dict[str, Any]:
        return await super().placeholder(data, message=message)
