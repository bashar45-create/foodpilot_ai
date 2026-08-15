"""Seed demo data so you can log in and exercise the ERP end-to-end.

Run with: ``python -m scripts.seed``

It is idempotent: re-running it will upsert the same demo rows. Hardcoded
business id and admin come from ``app.config`` so the JWT auth path keeps
working without any extra wiring.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from typing import Any

from bson import ObjectId

from app.config import get_settings
from app.core.security import hash_password
from app.database.client import mongo_manager


BUSINESS_ID = get_settings().hardcoded_business_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def upsert_business(db) -> None:
    await db.businesses.update_one(
        {"_id": BUSINESS_ID},
        {"$set": {
            "_id": BUSINESS_ID,
            "name": "Demo Foods Co.",
            "currency": "USD",
            "timezone": "UTC",
            "createdAt": _now(),
            "updatedAt": _now(),
        }},
        upsert=True,
    )
    print(f"  upserted business '{BUSINESS_ID}'")


async def upsert_admin(db) -> None:
    settings = get_settings()
    existing = await db.users.find_one({"businessId": BUSINESS_ID, "email": settings.admin_username})
    payload: dict[str, Any] = {
        "businessId": BUSINESS_ID,
        "name": settings.hardcoded_admin_name,
        "email": settings.admin_username,
        "passwordHash": hash_password(settings.admin_password),
        "role": "OWNER",
        "assignedStore": None,
        "isActive": True,
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    if existing:
        await db.users.update_one({"_id": existing["_id"]}, {"$set": {"updatedAt": _now(), "isActive": True}})
        print(f"  refreshed admin user '{settings.admin_username}'")
        return
    await db.users.insert_one(payload)
    print(f"  inserted admin user '{settings.admin_username}'")


INGREDIENTS = [
    {"name": "Chicken Patty", "unit": "pcs",  "minimumStock": 20,   "averageCost": 1.20, "purchasePrice": 1.20},
    {"name": "Burger Bun",   "unit": "pcs",  "minimumStock": 30,   "averageCost": 0.25, "purchasePrice": 0.25},
    {"name": "Cheese Slice", "unit": "pcs",  "minimumStock": 25,   "averageCost": 0.30, "purchasePrice": 0.30},
    {"name": "Lettuce",      "unit": "g",    "minimumStock": 500,  "averageCost": 0.01, "purchasePrice": 0.01},
    {"name": "Mayonnaise",   "unit": "g",    "minimumStock": 400,  "averageCost": 0.02, "purchasePrice": 0.02},
]


async def upsert_ingredients(db) -> dict[str, str]:
    """Returns a name -> id map so other seeders can reference them."""
    out: dict[str, str] = {}
    for ing in INGREDIENTS:
        existing = await db.ingredients.find_one({"businessId": BUSINESS_ID, "name": ing["name"]})
        doc = {
            "businessId": BUSINESS_ID,
            "name": ing["name"],
            "category": None,
            "unit": ing["unit"],
            "minimumStock": ing["minimumStock"],
            "maximumStock": None,
            "currentStock": 0,
            "supplierId": None,
            "purchasePrice": ing["purchasePrice"],
            "averageCost": ing["averageCost"],
            "barcode": None,
            "createdAt": _now(),
            "updatedAt": _now(),
        }
        if existing:
            await db.ingredients.update_one({"_id": existing["_id"]}, {"$set": {
                "unit": doc["unit"],
                "minimumStock": doc["minimumStock"],
                "averageCost": doc["averageCost"],
                "purchasePrice": doc["purchasePrice"],
                "updatedAt": _now(),
            }})
            out[ing["name"]] = str(existing["_id"])
        else:
            res = await db.ingredients.insert_one(doc)
            out[ing["name"]] = str(res.inserted_id)
    print(f"  upserted {len(INGREDIENTS)} ingredients")
    return out


async def upsert_burger_recipe(db, ingredient_ids: dict[str, str]) -> str:
    existing = await db.recipes.find_one({"businessId": BUSINESS_ID, "name": "Classic Burger"})
    payload = {
        "businessId": BUSINESS_ID,
        "name": "Classic Burger",
        "ingredients": [
            {"ingredientId": ingredient_ids["Chicken Patty"], "quantity": 1, "unit": "pcs", "optional": False, "notes": None},
            {"ingredientId": ingredient_ids["Burger Bun"],   "quantity": 1, "unit": "pcs", "optional": False, "notes": None},
            {"ingredientId": ingredient_ids["Cheese Slice"], "quantity": 1, "unit": "pcs", "optional": False, "notes": None},
            {"ingredientId": ingredient_ids["Lettuce"],      "quantity": 20, "unit": "g",  "optional": True,  "notes": None},
            {"ingredientId": ingredient_ids["Mayonnaise"],   "quantity": 15, "unit": "g",  "optional": False, "notes": None},
        ],
        "preparationSteps": [
            "Toast the bun lightly on the pan.",
            "Cook the chicken patty 3 minutes per side.",
            "Assemble: bun base -> mayo -> lettuce -> patty -> cheese -> bun top.",
        ],
        "servingSize": 1,
        "images": [],
        "status": "APPROVED",
        "versions": [],
        "isAiGenerated": False,
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    if existing:
        await db.recipes.update_one({"_id": existing["_id"]}, {"$set": {**payload, "createdAt": existing.get("createdAt", _now())}})
        print("  refreshed Classic Burger recipe")
        return str(existing["_id"])
    res = await db.recipes.insert_one(payload)
    print("  inserted Classic Burger recipe")
    return str(res.inserted_id)


async def upsert_burger_food_item(db, recipe_id: str) -> str:
    existing = await db.food_items.find_one({"businessId": BUSINESS_ID, "name": "Classic Burger"})
    cost = 1 * 1.20 + 1 * 0.25 + 1 * 0.30 + 20 * 0.01 + 15 * 0.02
    price = 5.00
    payload = {
        "businessId": BUSINESS_ID,
        "recipeId": recipe_id,
        "name": "Classic Burger",
        "category": "Burgers",
        "price": price,
        "cost": round(cost, 2),
        "estimatedProfit": round(price - cost, 2),
        "preparationTime": 7,
        "assignedStores": [],
        "image": None,
        "status": "ACTIVE",
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    if existing:
        await db.food_items.update_one({"_id": existing["_id"]}, {"$set": {**payload, "createdAt": existing.get("createdAt", _now())}})
        print("  refreshed Classic Burger menu item")
        return str(existing["_id"])
    res = await db.food_items.insert_one(payload)
    print("  inserted Classic Burger menu item")
    return str(res.inserted_id)


async def upsert_store(db) -> str:
    existing = await db.stores.find_one({"businessId": BUSINESS_ID, "name": "Cart 1"})
    payload = {
        "businessId": BUSINESS_ID,
        "name": "Cart 1",
        "type": "FOOD",
        "status": "OPEN",
        "location": {"address": "Downtown"},
        "openingHours": {"open": "09:00", "close": "22:00"},
        "managerId": None,
        "phone": None,
        "isActive": True,
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    if existing:
        await db.stores.update_one({"_id": existing["_id"]}, {"$set": {**payload, "createdAt": existing.get("createdAt", _now())}})
        print("  refreshed Cart 1 store")
        return str(existing["_id"])
    res = await db.stores.insert_one(payload)
    print("  inserted Cart 1 store")
    return str(res.inserted_id)


async def upsert_worker(db, store_id: str) -> str:
    email = "worker@store.com"
    existing = await db.users.find_one({"businessId": BUSINESS_ID, "email": email})
    payload = {
        "businessId": BUSINESS_ID,
        "name": "Demo Worker",
        "email": email,
        "passwordHash": hash_password("worker123"),
        "role": "WORKER",
        "assignedStore": store_id,
        "isActive": True,
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    if existing:
        await db.users.update_one({"_id": existing["_id"]}, {"$set": {"assignedStore": store_id, "isActive": True, "updatedAt": _now()}})
        print(f"  refreshed worker {email}")
        return str(existing["_id"])
    res = await db.users.insert_one(payload)
    print(f"  inserted worker {email}")
    return str(res.inserted_id)


async def main() -> None:
    print("Seeding demo data...")
    db = mongo_manager.database()

    await upsert_business(db)
    await upsert_admin(db)
    ingredient_ids = await upsert_ingredients(db)
    recipe_id = await upsert_burger_recipe(db, ingredient_ids)
    food_id = await upsert_burger_food_item(db, recipe_id)
    store_id = await upsert_store(db)
    await upsert_worker(db, store_id)

    # Assign food to store so it appears on the store's menu.
    await db.food_items.update_one(
        {"_id": ObjectId(food_id)},
        {"$addToSet": {"assignedStores": store_id}, "$set": {"updatedAt": _now()}},
    )
    print(f"  assigned Classic Burger to Cart 1 ({store_id})")

    print("Done.")


if __name__ == "__main__":
    mongo_manager.client()
    asyncio.run(main())
