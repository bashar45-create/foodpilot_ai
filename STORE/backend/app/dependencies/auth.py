from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.exceptions import UnauthorizedError
from app.core.security import TokenError, decode_access_token


bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    userId: str | None = None
    businessId: str | None = None
    role: str | None = None
    assignedStore: str | None = None
    name: str | None = None
    email: str | None = None


async def get_current_user(credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)] = None) -> CurrentUser:
    if credentials is None:
        raise UnauthorizedError()
    try:
        token_payload = decode_access_token(credentials.credentials)
    except TokenError as exc:
        # Expired/invalid access token → return 401 so the frontend refresh
        # interceptor can rotate the token and retry the request.
        code = "TOKEN_EXPIRED" if exc.expired else "INVALID_TOKEN"
        raise UnauthorizedError(code, str(exc)) from exc
    return CurrentUser(
        userId=token_payload.get("sub"),
        businessId=token_payload.get("businessId"),
        role=token_payload.get("role"),
        assignedStore=token_payload.get("assignedStore"),
        name=token_payload.get("name"),
        email=token_payload.get("email"),
    )
