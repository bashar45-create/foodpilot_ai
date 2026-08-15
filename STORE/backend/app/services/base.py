from __future__ import annotations

from typing import Any

from app.core.response import success_payload


class BaseService:
    def __init__(self, repository: Any | None = None) -> None:
        self.repository = repository

    async def placeholder(self, data: Any = None, *, message: str = "Not implemented yet") -> dict[str, Any]:
        return success_payload(data if data is not None else {}, message=message)
