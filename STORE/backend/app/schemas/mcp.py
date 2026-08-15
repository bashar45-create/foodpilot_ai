from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class McpFindRequest(BaseModel):
    collection: str = Field(min_length=1, max_length=64)
    filter: dict[str, Any] | None = None
    projection: dict[str, Any] | None = None
    sort: list[dict[str, int]] | None = None
    limit: int = Field(default=50, ge=1, le=200)


class McpAggregateRequest(BaseModel):
    collection: str = Field(min_length=1, max_length=64)
    pipeline: list[dict[str, Any]] = Field(default_factory=list)
    limit: int = Field(default=100, ge=1, le=500)


class McpCountRequest(BaseModel):
    collection: str = Field(min_length=1, max_length=64)
    filter: dict[str, Any] | None = None