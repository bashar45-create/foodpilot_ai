"""One-time migration: distribute each business's existing master ingredient stock
evenly across its active stores.

Background:
    The Inventory page's "Restock" dialog writes to ``ingredients.currentStock``
    (the master pantry) — but allocations and sales draw from
    ``store_inventory[storeId, ingredientId].quantity`` (per-store shelf).
    Until this migration runs, ``store_inventory`` is empty and allocations
    fail with "Insufficient stock for ingredient X: have 0".

What this does:
    For every business that has at least one active store:
      - For every ingredient with ``currentStock > 0`` in that business:
        - Distribute the stock evenly: ``share = currentStock / num_active_stores``.
        - Upsert a ``store_inventory`` row per active store with that share.

Note: ``ingredients.currentStock`` is left untouched — it remains the master
pool / "available any-store" total. After migration, the per-store rows are
purely the ledger that was previously missing; allocation flows now write to
both the pool (decrement) and the store (increment) atomically.

Idempotent: re-running this script re-derives from ``currentStock`` and
overwrites ``store_inventory`` rows, so it's safe to run multiple times.

Usage:
    cd backend && .venv/Scripts/python.exe scripts/migrate_store_inventory.py
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

    stores_coll = db["stores"]
    ingredients_coll = db["ingredients"]
    store_inventory_coll = db["store_inventory"]

    # Distinct businessIds in stores
    business_ids = await stores_coll.distinct("businessId")
    if not business_ids:
        # Fallback: single-tenant default
        default_bid = "business-default"
        if await stores_coll.count_documents({"businessId": default_bid}) > 0:
            business_ids = [default_bid]

    if not business_ids:
        print("No stores found. Nothing to migrate.")
        mongo_manager.close()
        return

    grand_total_rows = 0
    grand_total_ingredients = 0

    for business_id in business_ids:
        active_stores = [s async for s in stores_coll.find({"businessId": business_id, "isActive": True})]
        if not active_stores:
            print(f"[{business_id}] no active stores — skipping")
            continue
        n_stores = len(active_stores)
        print(f"[{business_id}] distributing across {n_stores} active store(s):")
        store_ids = [str(s["_id"]) for s in active_stores]

        count_ing = 0
        count_rows = 0
        async for ing in ingredients_coll.find({"businessId": business_id, "currentStock": {"$gt": 0}}):
            total = float(ing.get("currentStock") or 0)
            if total <= 0:
                continue
            share = total / n_stores  # evenly distribute
            for sid in store_ids:
                await store_inventory_coll.update_one(
                    {"businessId": business_id, "storeId": sid, "ingredientId": str(ing["_id"])},
                    {
                        "$set": {
                            "businessId": business_id,
                            "storeId": sid,
                            "ingredientId": str(ing["_id"]),
                            "quantity": share,
                            "updatedAt": ing.get("updatedAt"),
                        },
                        "$setOnInsert": {"createdAt": ing.get("createdAt")},
                    },
                    upsert=True,
                )
                count_rows += 1
            count_ing += 1
            name = ing.get("name") or str(ing["_id"])
            print(f"  - {name}: {total:g} -> {share:g} per store x {n_stores}")

        grand_total_ingredients += count_ing
        grand_total_rows += count_rows
        print(f"  -> wrote {count_rows} store_inventory row(s)\n")

    print(
        f"Done. {grand_total_ingredients} ingredient(s) distributed into "
        f"{grand_total_rows} store_inventory row(s)."
    )
    print(
        "Note: ingredients.currentStock was NOT touched — it stays as the master pool."
    )

    mongo_manager.close()


if __name__ == "__main__":
    asyncio.run(main())
