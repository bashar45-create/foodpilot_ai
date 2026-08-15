from __future__ import annotations

import asyncio
import contextlib

import pytest

from app.schemas.sync import SyncEvent
from app.services import sync_service
from app.services.sync_service import _reset_for_tests, sync_service as svc


@pytest.fixture(autouse=True)
def _clean() -> None:
    _reset_for_tests()
    yield
    _reset_for_tests()


def test_sync_event_deleted_action_forbids_payload() -> None:
    with pytest.raises(ValueError):
        SyncEvent(
            entity="inventory", action="deleted", businessId="biz_1",
            recordId="rec_1", payload={"should": "not be set"}, actorUserId="user_1",
        )


def test_sync_event_deleted_action_allows_no_payload() -> None:
    event = SyncEvent(entity="inventory", action="deleted", businessId="biz_1", recordId="rec_1", actorUserId="user_1")
    assert event.payload is None


@pytest.mark.asyncio
async def test_publish_subscribe_round_trip() -> None:
    event = SyncEvent(
        entity="inventory", action="updated", businessId="biz_1",
        recordId="rec_1", payload={"currentStock": 5}, actorUserId="user_1",
    )

    agen = svc.subscribe("biz_1")
    receive_task = asyncio.create_task(agen.__anext__())
    await asyncio.sleep(0)  # let the generator register its subscriber queue

    await svc.publish(event)
    received = await asyncio.wait_for(receive_task, timeout=1)

    assert received.eventId == event.eventId
    assert received.entity == "inventory"
    assert received.businessId == "biz_1"

    await agen.aclose()


@pytest.mark.asyncio
async def test_subscribe_only_receives_own_business_channel() -> None:
    other_business_event = SyncEvent(
        entity="inventory", action="updated", businessId="biz_2",
        recordId="rec_1", payload=None, actorUserId="user_1",
    )
    own_business_event = SyncEvent(
        entity="inventory", action="updated", businessId="biz_1",
        recordId="rec_2", payload=None, actorUserId="user_1",
    )

    agen = svc.subscribe("biz_1")
    receive_task = asyncio.create_task(agen.__anext__())
    await asyncio.sleep(0)

    await svc.publish(other_business_event)
    await svc.publish(own_business_event)
    received = await asyncio.wait_for(receive_task, timeout=1)

    assert received.recordId == "rec_2"

    await agen.aclose()


@pytest.mark.asyncio
async def test_unsubscribe_stops_delivery() -> None:
    agen = svc.subscribe("biz_3")
    consumer = asyncio.create_task(agen.__anext__())
    await asyncio.sleep(0)

    # Stop the in-flight __anext__ before closing the generator.
    consumer.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await consumer
    await agen.aclose()

    assert sync_service._SUBSCRIBERS == {}  # type: ignore[attr-defined]  # noqa: SLF001


@pytest.mark.asyncio
async def test_multiple_subscribers_each_get_event() -> None:
    event = SyncEvent(
        entity="sale", action="updated", businessId="biz_4",
        recordId="rec_1", payload=None, actorUserId="user_1",
    )

    a = svc.subscribe("biz_4")
    b = svc.subscribe("biz_4")
    ta = asyncio.create_task(a.__anext__())
    tb = asyncio.create_task(b.__anext__())
    await asyncio.sleep(0)

    await svc.publish(event)

    ra = await asyncio.wait_for(ta, timeout=1)
    rb = await asyncio.wait_for(tb, timeout=1)

    assert ra.eventId == rb.eventId == event.eventId

    ta.cancel()
    tb.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await ta
    with contextlib.suppress(asyncio.CancelledError):
        await tb
    await a.aclose()
    await b.aclose()
