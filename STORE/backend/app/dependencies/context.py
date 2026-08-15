from __future__ import annotations

from fastapi import Depends

from app.dependencies.auth import CurrentUser, get_current_user
from app.core.exceptions import UnauthorizedError


async def get_current_business_id(current_user: CurrentUser = Depends(get_current_user)) -> str:
    if not current_user.businessId:
        raise UnauthorizedError()
    return current_user.businessId
