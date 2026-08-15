"""One-time backfill: link orphaned recipes to their food items by name.

Recipes created before this fix were saved without a ``foodItemId``. Run this
script to look up each orphan recipe and link it to a food item whose name
matches the recipe's name (case-insensitive, whitespace-trimmed).

Usage:
    cd backend && .venv/Scripts/python.exe scripts/backfill_recipe_fooditem.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Allow running from repo root or backend dir
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.database.client import mongo_manager  # noqa: E402


async def main() -> None:
    settings = get_settings()
    db = mongo_manager.client()[settings.mongo_db_name]
    recipes = db["recipes"]
    foods = db["foods"]

    # Build name → food_id map (lowercase)
    food_map: dict[str, str] = {}
    async for doc in foods.find({}, {"name": 1}):
        if doc.get("name"):
            food_map[doc["name"].strip().lower()] = str(doc["_id"])

    matched = 0
    skipped = 0
    async for recipe in recipes.find({"foodItemId": {"$in": [None, "", {"$exists": False}]}}):
        name = (recipe.get("name") or "").strip().lower()
        food_id = food_map.get(name)
        if not food_id:
            skipped += 1
            print(f"  - skip: no food item matches '{recipe.get('name')}'")
            continue
        await recipes.update_one({"_id": recipe["_id"]}, {"$set": {"foodItemId": food_id}})
        matched += 1
        print(f"  + linked: '{recipe.get('name')}' -> food {food_id}")

    print(f"\nDone. matched={matched}, skipped={skipped}")
    mongo_manager.close()


if __name__ == "__main__":
    asyncio.run(main())