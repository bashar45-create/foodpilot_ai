from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.base import TimestampedDocument


UserRole = Literal["OWNER", "MANAGER", "WORKER", "SUPER_ADMIN"]


class UserDocument(TimestampedDocument):
    businessId: str
    name: str
    email: str
    passwordHash: str
    role: UserRole
    assignedStore: str | None = None
    isActive: bool = True
    lastLogin: datetime | None = None
    refreshToken: str | None = None
