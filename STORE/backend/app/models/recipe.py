from __future__ import annotations

from typing import Any, Literal

from app.models.base import TimestampedDocument


RecipeStatus = Literal["DRAFT", "APPROVED"]


class RecipeDocument(TimestampedDocument):
    businessId: str
    name: str
    ingredients: list[dict[str, Any]] = []
    preparationSteps: list[str] = []
    servingSize: float | None = None
    images: list[str] = []
    status: RecipeStatus = "DRAFT"
    versions: list[dict[str, Any]] = []
    isAiGenerated: bool = False
