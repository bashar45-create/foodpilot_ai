from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId

from app.repositories.allocation_repository import AllocationRepository
from app.repositories.ingredient_repository import IngredientRepository
from app.repositories.store_inventory_repository import StoreInventoryRepository
from app.schemas.sync import SyncEvent
from app.services.sync_service import sync_service


class StoreInventoryService:
    def __init__(self, db: Any) -> None:
        self.db = db
        self.repo = StoreInventoryRepository(db)
        self.ingredients = IngredientRepository(db)
        self.allocations = AllocationRepository(db)

    async def list_for_store(self, *, business_id: str, store_id: str) -> List[Dict[str, Any]]:
        rows = await self.repo.list_by_store(business_id=business_id, store_id=store_id)
        if not rows:
            return []

        # Collect every ingredientId referenced by the store's rows so we can
        # resolve names in one round-trip. Drop rows whose ingredient no longer
        # exists in the master pool — those are orphans from deleted ingredients
        # and have no useful name to display.
        missing: set[str] = set()
        for row in rows:
            if row.get("ingredientId"):
                missing.add(str(row["ingredientId"]))

        name_map: dict[str, Dict[str, Any]] = {}
        if missing:
            # Try businessId-scoped lookup first, then fall back to a global
            # _id-only lookup so workers whose JWT businessId doesn't match the
            # ingredient's businessId still get the name back.
            cursor = self.ingredients.collection.find(
                {"businessId": business_id, "_id": {"$in": list(missing)}}
            )
            async for ing in cursor:
                name_map[str(ing.get("_id"))] = ing
            unresolved = [mid for mid in missing if mid not in name_map]
            if unresolved:
                cursor = self.ingredients.collection.find(
                    {"_id": {"$in": unresolved}}
                )
                async for ing in cursor:
                    name_map[str(ing.get("_id"))] = ing

        enriched: List[Dict[str, Any]] = []
        for row in rows:
            ing_id = row.get("ingredientId")
            ing = name_map.get(str(ing_id)) if ing_id else None
            if not ing:
                # Orphan row — ingredient has been deleted from the master pool.
                # Skip rather than leak a raw id to the worker.
                continue
            if not row.get("ingredientName"):
                row["ingredientName"] = ing.get("name")
            if not row.get("unit"):
                row["unit"] = ing.get("unit")
            row["ingredient"] = {
                "id": str(ing.get("_id")),
                "name": ing.get("name"),
                "unit": ing.get("unit"),
                "category": ing.get("category"),
                "costPerUnit": ing.get("costPerUnit") or ing.get("averageCost") or 0,
            }
            enriched.append(row)
        return enriched

    async def get(self, *, business_id: str, store_id: str, ingredient_id: str) -> Dict[str, Any]:
        return await self.repo.get_one(business_id=business_id, store_id=store_id, ingredient_id=ingredient_id)

    async def set_stock(self, *, business_id: str, store_id: str, ingredient_id: str, quantity: float, minimumStock: float | None = None) -> Dict[str, Any]:
        return await self.repo.upsert(business_id=business_id, store_id=store_id, ingredient_id=ingredient_id, quantity=quantity, minimumStock=minimumStock)

    async def needs_today(
        self,
        *,
        business_id: str,
        store_id: str,
        today_iso: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Aggregate today's active-allocation ingredient requirements for a store.

        The mobile Stock page calls this instead of ``list_for_store`` so the
        worker sees only the ingredients they need to make today's allocated
        food — not the master pool, and not stale rows whose ingredient has
        been deleted from the master pool.

        For each ACTIVE allocation dated today, we walk its pre-computed
        ``deductions`` array (built at allocation creation time) and aggregate
        ``perUnit * (quantity - sold)`` per ingredient. The sold quantity is
        subtracted because the worker has already consumed that much from
        their shelf — they only need to make what's left.

        Each row is enriched with:
          - ``ingredientName`` and ``unit`` from the master pool
          - ``storeHas`` = the store's current shelf quantity for the ingredient
          - ``poolCurrent`` = the master pool's remaining stock (so workers can
            see whether they have raw material available to pull more)
          - ``shortfall`` = max(required - storeHas, 0)

        Ingredients whose master document has been deleted are skipped to
        avoid leaking raw ObjectIds to the worker.
        """
        if not today_iso:
            today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Look at a small window (today plus the previous 2 days) instead of
        # strictly today. Reason: an ACTIVE allocation dated yesterday may
        # still have unsold quantity the worker needs to make, and the
        # store's shelf still holds those ingredients — without widening the
        # window the worker would see "No active allocations for today" even
        # though there's real work to do. The aggregation below still uses
        # each allocation's `quantity - sold`, so a fully sold allocation
        # contributes zero and is correctly invisible.
        start_window = (datetime.strptime(today_iso, "%Y-%m-%d") - timedelta(days=2)).strftime("%Y-%m-%d")

        rows = await self.allocations.list(
            business_id=business_id,
            store_id=store_id,
            start_date=start_window,
            end_date=today_iso,
            status="ACTIVE",
            limit=500,
        )

        # required[iid] = aggregated per-ingredient demand
        required: Dict[str, float] = {}
        for alloc in rows:
            alloc_qty = float(alloc.get("quantity") or 0)
            sold = float(alloc.get("sold") or 0)
            remaining = max(alloc_qty - sold, 0)
            if remaining <= 0:
                continue
            for d in alloc.get("deductions") or []:
                ing_id = d.get("ingredientId")
                per_unit = float(d.get("perUnit") or 0)
                if not ing_id or per_unit <= 0:
                    continue
                required[str(ing_id)] = required.get(str(ing_id), 0.0) + per_unit * remaining

        if not required:
            return []

        # Resolve master ingredient docs in one round-trip so workers see
        # proper names instead of raw ids. _id is an ObjectId in Mongo, so
        # we must convert the string ids we aggregated from the deductions
        # array before querying — otherwise the filter won't match.
        name_map: Dict[str, Dict[str, Any]] = {}
        oids: List[ObjectId] = []
        for iid in required.keys():
            try:
                oids.append(ObjectId(iid))
            except (InvalidId, TypeError):
                continue
        if oids:
            cursor = self.ingredients.collection.find(
                {"businessId": business_id, "_id": {"$in": oids}}
            )
            async for ing in cursor:
                name_map[str(ing.get("_id"))] = ing

        # Pull the store's current shelf rows in one round-trip so the worker
        # sees what they already have on hand vs what they still need to make.
        shelf_rows = await self.repo.list_by_store(business_id=business_id, store_id=store_id)
        shelf_map: Dict[str, float] = {}
        for r in shelf_rows:
            iid = r.get("ingredientId")
            if iid is None:
                continue
            shelf_map[str(iid)] = float(r.get("quantity") or 0)

        enriched: List[Dict[str, Any]] = []
        for ing_id, need in required.items():
            ing = name_map.get(ing_id)
            if not ing:
                # Orphan — the master ingredient was deleted. Skip rather than
                # leak a raw id to the worker.
                continue
            have = shelf_map.get(ing_id, 0.0)
            enriched.append({
                "ingredientId": ing_id,
                "ingredientName": ing.get("name"),
                "unit": ing.get("unit"),
                "category": ing.get("category"),
                "required": round(need, 4),
                "storeHas": round(have, 4),
                "shortfall": round(max(need - have, 0.0), 4),
                "poolCurrent": float(ing.get("currentStock") or 0),
                "costPerUnit": float(ing.get("costPerUnit") or ing.get("averageCost") or 0),
            })

        # Highest shortfall first — workers can scan top-down for "what am I out of".
        enriched.sort(key=lambda r: (-float(r.get("shortfall") or 0), -float(r.get("required") or 0)))
        return enriched

    async def list_low_stock(self, *, business_id: str, store_id: str) -> List[Dict[str, Any]]:
        """Return rows below their minimum, enriched with embedded ingredient data
        so callers don't need to join separately (fixes dashboards showing IDs).

        The embedded ``ingredient`` payload includes ``costPerUnit`` so the
        dashboard can show the dollar value of the remaining low-stock
        without a second round-trip.
        """
        rows = await self.repo.list_by_store(business_id=business_id, store_id=store_id)
        flagged: List[Dict[str, Any]] = []
        for row in rows:
            quantity = float(row.get("quantity") or 0)
            minimum = float(row.get("minimumStock") or 0)
            if minimum > 0 and quantity <= minimum:
                ingredient_id = row.get("ingredientId")
                if ingredient_id:
                    ing = await self.ingredients.get(business_id=business_id, ingredient_id=ingredient_id)
                    if ing:
                        row["ingredient"] = {
                            "id": ing.get("id") or str(ingredient_id),
                            "name": ing.get("name"),
                            "unit": ing.get("unit"),
                            "category": ing.get("category"),
                            "costPerUnit": ing.get("costPerUnit") or ing.get("averageCost") or 0,
                        }
                flagged.append(row)
        return flagged

    async def allocate(self, *, business_id: str, store_id: str, ingredient_id: str, quantity: float) -> Dict[str, Any]:
        return await self.repo.upsert(business_id=business_id, store_id=store_id, ingredient_id=ingredient_id, allocated=quantity)

    async def try_consume(self, *, business_id: str, store_id: str, ingredient_id: str, amount: float) -> Dict[str, Any]:
        return await self.repo.atomic_decrement(business_id=business_id, store_id=store_id, ingredient_id=ingredient_id, amount=amount)

    async def ensure_row(self, *, business_id: str, store_id: str, ingredient_id: str) -> Dict[str, Any]:
        existing = await self.repo.get_one(business_id=business_id, store_id=store_id, ingredient_id=ingredient_id)
        if existing:
            return existing
        return await self.repo.upsert(business_id=business_id, store_id=store_id, ingredient_id=ingredient_id, quantity=0)

    # -------------------------------------------------------------------------
    # Pool-aware consumption (allocation / sales flows)
    # -------------------------------------------------------------------------

    async def try_consume_pool(
        self,
        *,
        business_id: str,
        store_id: str,
        ingredient_id: str,
        amount: float,
        actor_user_id: str = "",
    ) -> Dict[str, Any]:
        result = await self._try_consume_pool(
            business_id=business_id, store_id=store_id, ingredient_id=ingredient_id, amount=amount,
        )
        if result.get("ok"):
            await sync_service.publish(SyncEvent(
                entity="storeInventory", action="updated", businessId=business_id, storeId=store_id,
                recordId=ingredient_id, payload=None, actorUserId=actor_user_id,
            ))
        return result

    async def _try_consume_pool(
        self,
        *,
        business_id: str,
        store_id: str,
        ingredient_id: str,
        amount: float,
    ) -> Dict[str, Any]:
        """Allocate `amount` of an ingredient to ``store_id`` from the master pool.

        Semantics:
          - Reads ``ingredients.currentStock`` (the pool).
          - On success, decrements the pool and INCREMENTS the store's shelf
            (``store_inventory[store_id, ingredient_id].quantity``) by ``amount``.
            The store ends up with ``store_before_qty + amount`` units on hand.
          - Returns ``{"ok": True, "poolBefore", "poolAfter", "storeBefore", "storeAfter", "transactional"}``.
          - On insufficient pool, returns ``{"ok": False, "reason": "insufficient_pool",
            "poolCurrent", "storeCurrent"}`` and rolls back any partial write.

        Why increment-on-store: allocations place stock ONTO a store's shelf,
        not deduct from it. The pool goes down (raw materials consumed) while
        the store goes up (made available for sales).
        """
        if amount <= 0:
            return {"ok": False, "reason": "invalid_amount", "poolCurrent": None, "storeCurrent": None}

        store_before = await self.repo.get_one(
            business_id=business_id, store_id=store_id, ingredient_id=ingredient_id
        )
        store_before_qty = float((store_before or {}).get("quantity") or 0)

        client = self.db.client if hasattr(self.db, "client") else None
        used_transaction = False

        async def _do_consume(session=None) -> Dict[str, Any]:
            # 1. Decrement the master pool (validates against the budget)
            pool = await self.ingredients.decrement_pool(
                business_id=business_id,
                ingredient_id=ingredient_id,
                amount=amount,
                session=session,
            )
            if not pool.get("ok"):
                return {
                    "ok": False,
                    "reason": pool.get("reason", "insufficient_pool"),
                    "poolCurrent": pool.get("current"),
                    "storeCurrent": store_before_qty,
                    "compensated": False,
                }

            # 2. Mirror onto the store's shelf (creates row if absent)
            mirror = await self.repo.atomic_increment(
                business_id=business_id,
                store_id=store_id,
                ingredient_id=ingredient_id,
                amount=amount,
                session=session,
            )
            mirror_after = float((mirror or {}).get("quantity") or 0)

            # If the mirror somehow failed, refund the pool
            if mirror is None:
                await self.ingredients.increment_pool(
                    business_id=business_id,
                    ingredient_id=ingredient_id,
                    amount=amount,
                    session=session,
                )
                return {
                    "ok": False,
                    "reason": "store_mirror_failed",
                    "poolCurrent": pool.get("before"),
                    "storeCurrent": store_before_qty,
                    "compensated": True,
                }

            return {
                "ok": True,
                "poolBefore": pool.get("before"),
                "poolAfter": pool.get("after"),
                "storeBefore": store_before_qty,
                "storeAfter": mirror_after,
            }

        if client is not None:
            try:
                async with await client.start_session() as session:
                    async with session.start_transaction():
                        result = await _do_consume(session=session)
                used_transaction = True
                if result.get("ok"):
                    result["transactional"] = True
                    return result
                return result
            except Exception:
                # Replica-set/transactions not available — fall through to compensation path.
                pass

        result = await _do_consume(session=None)
        result["transactional"] = used_transaction
        return result

    async def refund_pool(
        self,
        *,
        business_id: str,
        store_id: str,
        ingredient_id: str,
        amount: float,
        actor_user_id: str = "",
    ) -> Dict[str, Any]:
        result = await self._refund_pool(
            business_id=business_id, store_id=store_id, ingredient_id=ingredient_id, amount=amount,
        )
        if result.get("ok"):
            await sync_service.publish(SyncEvent(
                entity="storeInventory", action="updated", businessId=business_id, storeId=store_id,
                recordId=ingredient_id, payload=None, actorUserId=actor_user_id,
            ))
        return result

    async def _refund_pool(
        self,
        *,
        business_id: str,
        store_id: str,
        ingredient_id: str,
        amount: float,
    ) -> Dict[str, Any]:
        """Reverse an allocation: take `amount` off the store's shelf and put it
        back into the master pool."""
        if amount <= 0:
            return {"ok": False, "reason": "invalid_amount"}

        client = self.db.client if hasattr(self.db, "client") else None
        used_transaction = False

        async def _do_refund(session=None) -> Dict[str, Any]:
            store = await self.repo.atomic_decrement(
                business_id=business_id,
                store_id=store_id,
                ingredient_id=ingredient_id,
                amount=amount,
                session=session,
            )
            if not store.get("ok"):
                # Nothing to refund at the store level — still try to top up the pool
                # if the store simply didn't have a row (treat as zero).
                pass
            store_after_qty = float(((store or {}).get("current") or {}).get("quantity") or 0)
            pool = await self.ingredients.increment_pool(
                business_id=business_id,
                ingredient_id=ingredient_id,
                amount=amount,
                session=session,
            )
            if not pool.get("ok"):
                if store.get("ok"):
                    await self.repo.atomic_increment(
                        business_id=business_id,
                        store_id=store_id,
                        ingredient_id=ingredient_id,
                        amount=amount,
                        session=session,
                    )
                return {"ok": False, "reason": pool.get("reason", "refund_failed")}
            return {
                "ok": True,
                "poolBefore": pool.get("before"),
                "poolAfter": pool.get("after"),
                "storeAfter": store_after_qty,
            }

        if client is not None:
            try:
                async with await client.start_session() as session:
                    async with session.start_transaction():
                        result = await _do_refund(session=session)
                used_transaction = True
                if result.get("ok"):
                    result["transactional"] = True
                    return result
                return result
            except Exception:
                pass

        result = await _do_refund(session=None)
        result["transactional"] = used_transaction
        return result
