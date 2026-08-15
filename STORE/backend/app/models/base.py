from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TimestampedDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str | None = Field(default=None, alias="_id")
    createdAt: datetime | None = None
    updatedAt: datetime | None = None

    def to_mongo(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True, exclude_none=True)

    @classmethod
    def now(cls) -> datetime:
        return datetime.now(timezone.utc)

    @classmethod
    def from_mongo(cls, payload: dict[str, Any]) -> "TimestampedDocument":
        return cls.model_validate(payload)


def with_timestamps(payload: dict[str, Any]) -> dict[str, Any]:
    timestamp = datetime.now(timezone.utc)
    result = dict(payload)
    result.setdefault("createdAt", timestamp)
    result["updatedAt"] = timestamp
    return result
