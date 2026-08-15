from __future__ import annotations

from typing import Any, Annotated

from pydantic import BaseModel, Field


class RecipeIngredientInput(BaseModel):
    ingredientId: str
    quantity: float
    unit: str
    optional: bool = False
    notes: str | None = None


class RecipeCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1)]
    foodItemId: str | None = None
    ingredients: list[RecipeIngredientInput] = []
    preparationSteps: list[str] = []
    servingSize: float | None = None


class RecipeUpdateRequest(BaseModel):
    name: str | None = None
    foodItemId: str | None = None
    ingredients: list[RecipeIngredientInput] | None = None
    preparationSteps: list[str] | None = None
    servingSize: float | None = None


class RecipeDuplicateRequest(BaseModel):
    name: str | None = None


class RecipeDraftAiRequest(BaseModel):
    prompt: Annotated[str, Field(min_length=1)]


class RecipeApproveRequest(BaseModel):
    approved: bool = True
