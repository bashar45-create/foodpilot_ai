"""Real-time ``SyncEvent`` fan-out — pure in-process asyncio.

No Redis, no MongoDB change streams. Each ``subscribe(business_id)`` registers
a bounded ``asyncio.Queue`` in the per-business subscriber set; ``publish``
copies the event into every queue (dropping oldest if full) and yields it.

This is sufficient for a single-process backend deployment (the current
dev/test setup). For horizontally scaled production you would swap this for
Redis pub/sub or MongoDB change streams — the interface (``publish`` /
``subscribe``) stays the same.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any

from app.schemas.sync import SyncEvent

logger = logging.getLogger(__name__)

# Per-business subscriber queues. ``defaultdict`` so first subscribe auto-c
_SUBSCRIBERS: dict[str, set[asyncio.Queue[SyncEvent]]] = defaultdict(set)
_SUBSCRIBER_LOCK = asyncio.Lock()

# Bound per-subscriber queue so a slow consumer can't OOM the process.
QUEUE_MAX = 1024


def _channel(business_id: str) -> str:
    return f"sync:business:{business_id}"


class SyncService:
    """Publish/subscribe bridge for real-time ``SyncEvent`` distribution.

    Backend deployments run a single process, so this is in-memory; no
    external broker is required.
    """

    async def publish(self, event: SyncEvent) -> None:
        subs = list(_SUBSCRIBERS.get(_channel(event.businessId), ()))
        if not subs:
            return
        for queue in subs:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Drop the oldest unread event so the newest one always lands.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    logger.warning(
                        "sync subscriber queue still full after drop — slowest "
                        "client dropped an event (business=%s)",
                        event.businessId,
                    )

    async def subscribe(self, business_id: str) -> AsyncIterator[SyncEvent]:
        channel = _channel(business_id)
        queue: asyncio.Queue[SyncEvent] = asyncio.Queue(maxsize=QUEUE_MAX)

        async with _SUBSCRIBER_LOCK:
            _SUBSCRIBERS[channel].add(queue)

        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            async with _SUBSCRIBER_LOCK:
                _SUBSCRIBERS[channel].discard(queue)
                if not _SUBSCRIBERS[channel]:
                    _SUBSCRIBERS.pop(channel, None)


sync_service = SyncService()


def _reset_for_tests() -> None:
    """Clear all subscriber state — used only by test suite teardown."""
    _SUBSCRIBERS.clear()


__all__: list[Any] = ["SyncService", "sync_service", "_reset_for_tests"]
