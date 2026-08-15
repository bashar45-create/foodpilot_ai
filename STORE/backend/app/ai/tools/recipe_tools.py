from __future__ import annotations

from typing import Any

from langchain_core.tools import StructuredTool
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel


class RecipeArgs(BaseModel):
    recipe_name_or_id: str


def build_recipe_tools(db: AsyncIOMotorDatabase, business_id: str) -> list[StructuredTool]:
    async def _find_recipe(recipe_name_or_id: str) -> dict[str, Any] | None:
        return await db["recipes"].find_one(
            {
                "businessId": business_id,
                "$or": [
                    {"_id": recipe_name_or_id},
                    {"name": {"$regex": recipe_name_or_id, "$options": "i"}},
                ],
            }
        )

    async def get_recipe_ingredients(recipe_name_or_id: str) -> dict[str, Any]:
        recipe = await _find_recipe(recipe_name_or_id)
        if not recipe:
            return {"recipe": recipe_name_or_id, "ingredients": [], "found": False}
        ingredients = recipe.get("ingredients", [])
        return {
            "found": True,
            "recipeId": str(recipe.get("_id", "")),
            "recipe": recipe.get("name"),
            "ingredients": ingredients,
        }

    async def get_recipe_cost(recipe_name_or_id: str) -> dict[str, Any]:
        recipe = await _find_recipe(recipe_name_or_id)
        if not recipe:
            return {"recipe": recipe_name_or_id, "estimatedCost": 0, "found": False}

        total_cost = 0.0
        breakdown: list[dict[str, Any]] = []
        for item in recipe.get("ingredients", []):
            ingredient_id = item.get("ingredientId")
            if not ingredient_id:
                continue
            ingredient = await db["ingredients"].find_one(
                {
                    "businessId": business_id,
                    "$or": [
                        {"_id": ingredient_id},
                        {"_id": str(ingredient_id)},
                    ],
                }
            )
            avg_cost = float((ingredient or {}).get("averageCost", 0) or 0)
            quantity = float(item.get("quantity", 0) or 0)
            line_cost = avg_cost * quantity
            total_cost += line_cost
            breakdown.append(
                {
                    "ingredientId": str(ingredient_id),
                    "ingredient": (ingredient or {}).get("name", ingredient_id),
                    "quantity": quantity,
                    "averageCost": avg_cost,
                    "lineCost": round(line_cost, 4),
                }
            )

        return {
            "found": True,
            "recipeId": str(recipe.get("_id", "")),
            "recipe": recipe.get("name"),
            "estimatedCost": round(total_cost, 4),
            "currency": "BDT",
            "breakdown": breakdown,
        }

    return [
        StructuredTool.from_function(
            coroutine=get_recipe_cost,
            func=None,
            name="get_recipe_cost",
            description="Get estimated recipe cost from ingredient average costs and quantities.",
            args_schema=RecipeArgs,
        ),
        StructuredTool.from_function(
            coroutine=get_recipe_ingredients,
            func=None,
            name="get_recipe_ingredients",
            description="Get ingredient list of a recipe.",
            args_schema=RecipeArgs,
        ),
    ]
