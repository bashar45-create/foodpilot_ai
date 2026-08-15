from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.repositories.ticket_repository import TicketRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


class TicketNotFoundError(Exception):
    pass


class TicketService:
    def __init__(self, db: Any) -> None:
        self.repo = TicketRepository(db)

    async def list_tickets(self, *, business_id: str, status: Optional[str] = None, assigned_to: Optional[str] = None) -> List[Dict[str, Any]]:
        return await self.repo.list(business_id=business_id, status=status, assigned_to=assigned_to)

    async def get_ticket(self, *, business_id: str, ticket_id: str) -> Dict[str, Any]:
        item = await self.repo.get(business_id=business_id, ticket_id=ticket_id)
        if not item:
            raise TicketNotFoundError(ticket_id)
        return item

    async def create_ticket(self, *, business_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        title = (payload.get("title") or "").strip()
        description = (payload.get("description") or "").strip()
        if not title:
            raise ValueError("title is required")
        if not description:
            raise ValueError("description is required")
        doc = {
            "title": title,
            "description": description,
            "priority": payload.get("priority") or "MEDIUM",
            "raisedBy": payload.get("raisedBy"),
        }
        item = await self.repo.create(business_id=business_id, payload=doc)
        await sync_service.publish(SyncEvent(
            entity="ticket", action="created", businessId=business_id,
            recordId=item["id"], payload=item, actorUserId=actor_user_id, storeId=None,
        ))
        return item

    async def update_ticket(self, *, business_id: str, ticket_id: str, payload: Dict[str, Any], actor_user_id: str) -> Dict[str, Any]:
        await self.get_ticket(business_id=business_id, ticket_id=ticket_id)
        update = {k: v for k, v in payload.items() if k in {"title", "description", "priority", "status", "assignedTo"} and v is not None}
        item = await self.repo.update(business_id=business_id, ticket_id=ticket_id, payload=update)
        if not item:
            raise TicketNotFoundError(ticket_id)
        await sync_service.publish(SyncEvent(
            entity="ticket", action="updated", businessId=business_id,
            recordId=ticket_id, payload=item, actorUserId=actor_user_id, storeId=None,
        ))
        return item

    async def add_comment(self, *, business_id: str, ticket_id: str, text: str, actor_user_id: str) -> Dict[str, Any]:
        await self.get_ticket(business_id=business_id, ticket_id=ticket_id)
        comment = {
            "text": text,
            "authorId": actor_user_id,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        item = await self.repo.add_comment(business_id=business_id, ticket_id=ticket_id, comment=comment)
        if not item:
            raise TicketNotFoundError(ticket_id)
        await sync_service.publish(SyncEvent(
            entity="ticket", action="updated", businessId=business_id,
            recordId=ticket_id, payload=item, actorUserId=actor_user_id, storeId=None,
        ))
        return item

    async def set_status(self, *, business_id: str, ticket_id: str, status: str, actor_user_id: str) -> Dict[str, Any]:
        await self.get_ticket(business_id=business_id, ticket_id=ticket_id)
        item = await self.repo.set_status(business_id=business_id, ticket_id=ticket_id, status=status)
        if not item:
            raise TicketNotFoundError(ticket_id)
        await sync_service.publish(SyncEvent(
            entity="ticket", action="updated", businessId=business_id,
            recordId=ticket_id, payload=item, actorUserId=actor_user_id, storeId=None,
        ))
        return item

    async def assign_ticket(self, *, business_id: str, ticket_id: str, assigned_to: Optional[str], actor_user_id: str) -> Dict[str, Any]:
        await self.get_ticket(business_id=business_id, ticket_id=ticket_id)
        item = await self.repo.assign(business_id=business_id, ticket_id=ticket_id, assigned_to=assigned_to)
        if not item:
            raise TicketNotFoundError(ticket_id)
        await sync_service.publish(SyncEvent(
            entity="ticket", action="updated", businessId=business_id,
            recordId=ticket_id, payload=item, actorUserId=actor_user_id, storeId=None,
        ))
        return item

    async def add_attachments(self, *, business_id: str, ticket_id: str, attachments: List[str], actor_user_id: str) -> Dict[str, Any]:
        await self.get_ticket(business_id=business_id, ticket_id=ticket_id)
        item = await self.repo.add_attachments(business_id=business_id, ticket_id=ticket_id, attachments=attachments)
        if not item:
            raise TicketNotFoundError(ticket_id)
        await sync_service.publish(SyncEvent(
            entity="ticket", action="updated", businessId=business_id,
            recordId=ticket_id, payload=item, actorUserId=actor_user_id, storeId=None,
        ))
        return item
