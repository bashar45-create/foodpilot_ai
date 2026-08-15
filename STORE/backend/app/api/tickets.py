from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import ConflictError, NotFoundError
from app.core.response import success_payload
from app.database.client import get_database_dependency
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.ticket import (
    TicketAssignRequest,
    TicketAttachmentRequest,
    TicketCommentRequest,
    TicketCreateRequest,
    TicketStatusUpdateRequest,
    TicketUpdateRequest,
)
from app.services.ticket_service import TicketNotFoundError, TicketService

router = APIRouter(prefix="/tickets", tags=["tickets"])


def _service(db: AsyncIOMotorDatabase = Depends(get_database_dependency)) -> TicketService:
    return TicketService(db)


@router.get("")
async def list_tickets(
    status_: Annotated[str | None, Query(alias="status")] = None,
    assignedTo: Annotated[str | None, Query()] = None,
    current_user: CurrentUser = Depends(get_current_user),
    service: TicketService = Depends(_service),
):
    rows = await service.list_tickets(business_id=current_user.businessId or "", status=status_, assigned_to=assignedTo)
    return success_payload(rows)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ticket(
    body: TicketCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: TicketService = Depends(_service),
):
    payload: dict[str, Any] = body.model_dump()
    payload["raisedBy"] = current_user.userId
    try:
        item = await service.create_ticket(business_id=current_user.businessId or "", payload=payload, actor_user_id=current_user.userId or "")
    except ValueError as exc:
        raise ConflictError("VALIDATION_ERROR", str(exc))
    return success_payload(item, message="Ticket created")


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: TicketService = Depends(_service),
):
    try:
        item = await service.get_ticket(business_id=current_user.businessId or "", ticket_id=ticket_id)
    except TicketNotFoundError:
        raise NotFoundError("TICKET_NOT_FOUND", "Ticket not found")
    return success_payload(item)


@router.put("/{ticket_id}")
async def update_ticket(
    ticket_id: str,
    body: TicketUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: TicketService = Depends(_service),
):
    payload: dict[str, Any] = body.model_dump(exclude_none=True)
    try:
        item = await service.update_ticket(business_id=current_user.businessId or "", ticket_id=ticket_id, payload=payload, actor_user_id=current_user.userId or "")
    except TicketNotFoundError:
        raise NotFoundError("TICKET_NOT_FOUND", "Ticket not found")
    return success_payload(item, message="Ticket updated")


@router.post("/{ticket_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    ticket_id: str,
    body: TicketCommentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: TicketService = Depends(_service),
):
    try:
        item = await service.add_comment(business_id=current_user.businessId or "", ticket_id=ticket_id, text=body.text, actor_user_id=current_user.userId or "")
    except TicketNotFoundError:
        raise NotFoundError("TICKET_NOT_FOUND", "Ticket not found")
    return success_payload(item, message="Comment added")


@router.patch("/{ticket_id}/status")
async def change_status(
    ticket_id: str,
    body: TicketStatusUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: TicketService = Depends(_service),
):
    try:
        item = await service.set_status(business_id=current_user.businessId or "", ticket_id=ticket_id, status=body.status, actor_user_id=current_user.userId or "")
    except TicketNotFoundError:
        raise NotFoundError("TICKET_NOT_FOUND", "Ticket not found")
    return success_payload(item, message="Ticket status updated")


@router.patch("/{ticket_id}/assign")
async def assign_ticket(
    ticket_id: str,
    body: TicketAssignRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: TicketService = Depends(_service),
):
    try:
        item = await service.assign_ticket(business_id=current_user.businessId or "", ticket_id=ticket_id, assigned_to=body.assignedTo, actor_user_id=current_user.userId or "")
    except TicketNotFoundError:
        raise NotFoundError("TICKET_NOT_FOUND", "Ticket not found")
    return success_payload(item, message="Ticket assigned")


@router.post("/{ticket_id}/attachments", status_code=status.HTTP_201_CREATED)
async def add_attachments(
    ticket_id: str,
    body: TicketAttachmentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: TicketService = Depends(_service),
):
    try:
        item = await service.add_attachments(business_id=current_user.businessId or "", ticket_id=ticket_id, attachments=body.attachments, actor_user_id=current_user.userId or "")
    except TicketNotFoundError:
        raise NotFoundError("TICKET_NOT_FOUND", "Ticket not found")
    return success_payload(item, message="Attachments added")
