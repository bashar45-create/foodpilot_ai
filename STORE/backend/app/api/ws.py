from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.dependencies.ws_auth import authenticate_ws
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service

router = APIRouter(tags=["sync"])
logger = logging.getLogger(__name__)

WS_UNAUTHORIZED_CLOSE_CODE = 4401
IDLE_TIMEOUT_SECONDS = 90


def _is_authorized(event: SyncEvent, *, role: str | None, assigned_store: str | None) -> bool:
    if event.storeId is None:
        return True
    if (role or "").upper() == "WORKER":
        return event.storeId == assigned_store
    return True


@router.websocket("/ws")
async def sync_websocket(websocket: WebSocket, token: str | None = None) -> None:
    await websocket.accept()

    current_user = await authenticate_ws(token)
    if current_user is None or not current_user.businessId:
        logger.warning("Rejected unauthorized WebSocket sync connection attempt from %s", websocket.client)
        await websocket.close(code=WS_UNAUTHORIZED_CLOSE_CODE)
        return

    connection_id = str(uuid.uuid4())
    business_id = current_user.businessId
    role = current_user.role
    assigned_store = current_user.assignedStore
    activity_event = asyncio.Event()
    activity_event.set()

    async def receive_loop() -> None:
        try:
            while True:
                message = await websocket.receive_json()
                activity_event.set()
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
        except WebSocketDisconnect:
            pass

    async def broadcast_loop() -> None:
        async for event in sync_service.subscribe(business_id):
            if not _is_authorized(event, role=role, assigned_store=assigned_store):
                continue
            try:
                # Use Pydantic's mode='json' to coerce datetimes / UUIDs to
                # JSON-safe strings. Starlette's default encoder only handles
                # primitives + a few stdlib types — raw datetime objects raise
                # TypeError("Object of type datetime is not JSON serializable").
                payload = event.model_dump(mode="json")
            except Exception as exc:  # noqa: BLE001 - never tear down WS for one bad event
                logger.warning("sync broadcast dropped malformed event: %s", exc)
                continue
            try:
                await websocket.send_json(payload)
            except Exception as exc:  # noqa: BLE001
                logger.info("sync WS send failed (client likely disconnected): %s", exc)
                return
            activity_event.set()

    async def idle_watchdog() -> None:
        # Guards against phantom ClientSubscriptions: a connection that lost
        # its client (e.g. a phone that lost signal without a clean TCP
        # close) would otherwise hold an in-process subscriber queue open
        # indefinitely, since neither receive_json() nor a quiet
        # sync_service.subscribe() stream will ever raise on their own.
        while True:
            activity_event.clear()
            try:
                await asyncio.wait_for(activity_event.wait(), timeout=IDLE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                logger.info(
                    "Closing idle sync WebSocket connection %s (business %s) after %ss with no client ping or outbound event",
                    connection_id, business_id, IDLE_TIMEOUT_SECONDS,
                )
                await websocket.close(code=1000)
                return

    receiver_task = asyncio.create_task(receive_loop())
    broadcast_task = asyncio.create_task(broadcast_loop())
    watchdog_task = asyncio.create_task(idle_watchdog())
    tasks = {receiver_task, broadcast_task, watchdog_task}

    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc is not None and not isinstance(exc, (WebSocketDisconnect, asyncio.CancelledError)):
                # Log and swallow — the broadcast loop may exit cleanly when
                # Redis is unavailable; we don't want that to surface as an
                # ASGI exception and tear the whole WS connection down.
                logger.warning("sync WS task %s ended with exc: %s", task, exc)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("sync WS unhandled exc: %s", exc)
    finally:
        for task in tasks:
            task.cancel()
        logger.info("Sync WebSocket connection %s closed for business %s", connection_id, business_id)
