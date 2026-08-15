from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator

SyncEntity = Literal[
    "inventory",
    "storeInventory",
    "sale",
    "recipe",
    "attendance",
    "ticket",
    "store",
    "allocation",
    "assignment",
    "food",
    "user",
]

SyncAction = Literal["created", "updated", "deleted"]


class SyncEvent(BaseModel):
    eventId: str = Field(default_factory=lambda: str(uuid4()))
    entity: SyncEntity
    action: SyncAction
    businessId: str
    storeId: str | None = None
    recordId: str
    payload: dict[str, Any] | None = None
    actorUserId: str
    occurredAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @model_validator(mode="after")
    def _deleted_has_no_payload(self) -> "SyncEvent":
        if self.action == "deleted" and self.payload is not None:
            raise ValueError("payload must be None when action is 'deleted'")
        return self
