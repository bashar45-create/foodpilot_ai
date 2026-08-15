"""Bootstrap MongoDB indexes for the STORE ERP database.

Run with: ``python -m scripts.init_db``
"""
from __future__ import annotations

import asyncio

from pymongo import ASCENDING

from app.database.client import mongo_manager


INDEXES = {
    "businesses": [],
    "users": [
        ([("businessId", ASCENDING), ("email", ASCENDING)], {"unique": True, "name": "uniq_business_email"}),
    ],
    "stores": [
        ([("businessId", ASCENDING), ("name", ASCENDING)], {"unique": True, "name": "uniq_business_store_name"}),
    ],
    "ingredients": [
        ([("businessId", ASCENDING), ("name", ASCENDING)], {"unique": True, "name": "uniq_business_ingredient_name"}),
    ],
    "recipes": [
        ([("businessId", ASCENDING), ("name", ASCENDING)], {"unique": True, "name": "uniq_business_recipe_name"}),
    ],
    "food_items": [
        ([("businessId", ASCENDING), ("name", ASCENDING)], {"unique": True, "name": "uniq_business_food_name"}),
    ],
    "store_inventory": [
        ([("businessId", ASCENDING), ("storeId", ASCENDING), ("ingredientId", ASCENDING)], {"unique": True, "name": "uniq_store_ingredient"}),
    ],
    "daily_assignments": [
        ([("businessId", ASCENDING), ("storeId", ASCENDING), ("date", ASCENDING)], {"unique": True, "name": "uniq_store_date"}),
    ],
    "sales": [
        ([("businessId", ASCENDING), ("storeId", ASCENDING), ("createdAt", ASCENDING)], {"name": "sales_store_time"}),
        ([("businessId", ASCENDING), ("createdAt", ASCENDING)], {"name": "sales_business_time"}),
    ],
    "inventory_logs": [],
    "notifications": [
        ([("businessId", ASCENDING), ("userId", ASCENDING), ("read", ASCENDING), ("createdAt", ASCENDING)], {"name": "notif_user_state_time"}),
    ],
    "tickets": [],
    "audit_logs": [],
}


async def init_indexes() -> None:
    db = mongo_manager.database()
    for collection_name, indexes in INDEXES.items():
        if not indexes:
            continue
        collection = db[collection_name]
        for keys, options in indexes:
            name = options.get("name")
            await collection.create_index(keys, name=name, background=True)
            print(f"  ensured index '{name}' on {collection_name}")


async def main() -> None:
    print("Initializing MongoDB indexes...")
    await init_indexes()
    print("Done.")


if __name__ == "__main__":
    mongo_manager.client()
    asyncio.run(main())
