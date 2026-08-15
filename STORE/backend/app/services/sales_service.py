from __future__ import annotations

from typing import Any

from app.repositories.sales_repository import SalesRepository
from app.services.base import BaseService


class SalesService(BaseService):
    def __init__(self, repository: SalesRepository | None = None) -> None:
        super().__init__(repository or SalesRepository(None))

    async def placeholder(self, data: Any = None, *, message: str = "Sales module placeholder") -> dict[str, Any]:
        return await super().placeholder(data, message=message)
