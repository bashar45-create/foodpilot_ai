from __future__ import annotations

from app.core.security import TokenError, decode_access_token
from app.dependencies.auth import CurrentUser


async def authenticate_ws(token: str | None) -> CurrentUser | None:
    """Decode a WebSocket handshake token.

    Returns None (never raises) so the caller can close the socket silently
    per the FR-002 clarification: unauthorized attempts are rejected without
    surfacing details to the client, while the caller is responsible for
    logging the attempt server-side.
    """
    if not token:
        return None
    try:
        token_payload = decode_access_token(token)
    except TokenError:
        return None
    return CurrentUser(
        userId=token_payload.get("sub"),
        businessId=token_payload.get("businessId"),
        role=token_payload.get("role"),
        assignedStore=token_payload.get("assignedStore"),
        name=token_payload.get("name"),
        email=token_payload.get("email"),
    )
