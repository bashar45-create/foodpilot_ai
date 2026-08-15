from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends

from app.core.exceptions import ForbiddenError
from app.dependencies.auth import CurrentUser, get_current_user


def require_role(allowed_roles: list[str]) -> Callable[[CurrentUser], CurrentUser]:
    async def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise ForbiddenError(details={"allowedRoles": allowed_roles, "currentRole": current_user.role})
        return current_user

    return dependency
