from __future__ import annotations

import pytest

from app.core.security import create_access_token
from app.dependencies.ws_auth import authenticate_ws


@pytest.mark.asyncio
async def test_authenticate_ws_accepts_valid_token() -> None:
    token = create_access_token({"sub": "user_1", "businessId": "biz_1", "role": "WORKER", "assignedStore": "store_1"})

    current_user = await authenticate_ws(token)

    assert current_user is not None
    assert current_user.userId == "user_1"
    assert current_user.businessId == "biz_1"
    assert current_user.role == "WORKER"
    assert current_user.assignedStore == "store_1"


@pytest.mark.asyncio
async def test_authenticate_ws_rejects_missing_token() -> None:
    assert await authenticate_ws(None) is None
    assert await authenticate_ws("") is None


@pytest.mark.asyncio
async def test_authenticate_ws_rejects_malformed_token() -> None:
    assert await authenticate_ws("not-a-real-jwt") is None
