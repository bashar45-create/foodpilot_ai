"""Redis shim — kept only so historical imports keep working.

Real-time sync now uses an in-process asyncio fan-out
(see ``app.services.sync_service``). This module no longer opens any network
connection and is safe to import at startup.
"""
from __future__ import annotations


class _RedisStub:
    """Minimal no-op stand-in. Returns itself for ``pubsub()`` so any
    legacy code path that still calls ``redis_manager.client().pubsub()``
    gets something that quacks like pubsub but does nothing."""

    def pubsub(self) -> "_RedisStub":
        return self

    async def subscribe(self, *_args: object, **_kwargs: object) -> None:
        return None

    async def unsubscribe(self, *_args: object, **_kwargs: object) -> None:
        return None

    async def aclose(self) -> None:
        return None

    async def listen(self):  # pragma: no cover - never awaited
        if False:
            yield None

    async def publish(self, *_args: object, **_kwargs: object) -> int:
        return 0


class RedisClientManager:
    def __init__(self) -> None:
        self._client: _RedisStub | None = None

    def client(self) -> _RedisStub:
        if self._client is None:
            self._client = _RedisStub()
        return self._client

    async def close(self) -> None:
        self._client = None


redis_manager = RedisClientManager()
