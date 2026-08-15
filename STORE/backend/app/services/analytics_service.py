from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from app.repositories.ingredient_repository import IngredientRepository
from app.repositories.food_repository import FoodRepository
from app.repositories.inventory_log_repository import InventoryLogRepository
from app.repositories.sale_repository import SaleRepository
from app.repositories.store_repository import StoreRepository
from app.repositories.user_repository import UserRepository
from app.services.store_inventory_service import StoreInventoryService


_VALID_GROUP_BY = {"day", "week", "month", "store", "food"}


def _parse_iso_date(value: Optional[str], default: datetime) -> datetime:
    """Parse an ISO date string (YYYY-MM-DD) into a UTC datetime at midnight."""
    if not value:
        return default
    try:
        d = datetime.strptime(value[:10], "%Y-%m-%d")
        return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    except Exception:
        return default


def _format_day(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def _bucket_key(d: datetime, group_by: str) -> str:
    if group_by == "week":
        iso = d.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    if group_by == "month":
        return f"{d.year}-{d.month:02d}"
    return _format_day(d)


class AnalyticsService:
    def __init__(self, db: Any) -> None:
        self.db = db
        self.ingredients = IngredientRepository(db)
        # NB: attribute names avoid shadowing the public methods ``food()``
        # and ``stores()`` defined further below.
        self.food_repo = FoodRepository(db)
        self.stores_repo = StoreRepository(db)
        self.users = UserRepository(db)
        self.sales = SaleRepository(db)
        self.inventory_logs = InventoryLogRepository(db)
        self.store_inventory = StoreInventoryService(db)

    # ----- dashboard -----

    async def dashboard(self, *, business_id: str, store_id: str | None = None) -> Dict[str, Any]:
        all_ingredients = await self.ingredients.list(business_id=business_id)
        all_stores = await self.stores_repo.list(business_id=business_id)
        active_stores = [s for s in all_stores if (s.get("status") or "ACTIVE").upper() in {"ACTIVE", "OPEN"}]
        now = datetime.now(timezone.utc)
        day_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        today_count = 0
        today_revenue = 0.0
        if store_id:
            today_count = await self.sales.count_for_day(business_id=business_id, store_id=store_id, day_start=day_start, day_end=day_end)
            todays = await self.sales.list(business_id=business_id, store_id=store_id, start=day_start, end=day_end, limit=500)
            today_revenue = round(sum(float(s.get("totalPrice") or 0) for s in todays), 2)
        else:
            todays = await self.sales.list(business_id=business_id, start=day_start, end=day_end, limit=500)
            today_count = len(todays)
            today_revenue = round(sum(float(s.get("totalPrice") or 0) for s in todays), 2)

        low_stock_count = 0
        if store_id:
            low = await self.store_inventory.list_low_stock(business_id=business_id, store_id=store_id)
            # Also count master-pool low-stock items so the dashboard reflects
            # the business-wide picture, not just the per-store shelf.
            pool_low = sum(
                1 for ing in all_ingredients
                if float(ing.get("minimumStock") or 0) > 0
                and float(ing.get("currentStock") or 0) <= float(ing.get("minimumStock") or 0)
            )
            low_stock_count = len(low) + pool_low
        else:
            low_stock_count = sum(1 for ing in all_ingredients if float(ing.get("currentStock") or 0) <= float(ing.get("minimumStock") or 0))

        return {
            "totals": {
                "ingredients": len(all_ingredients),
                "activeStores": len(active_stores),
                "todaySales": today_count,
                "todayRevenue": today_revenue,
                "lowStockItems": low_stock_count,
            },
            "generatedAt": now.isoformat(),
        }

    # ----- date helpers -----

    @staticmethod
    def _date_range(*, start: Optional[str], end: Optional[str], default_days: int = 30) -> tuple[datetime, datetime]:
        now = datetime.now(timezone.utc)
        default_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=default_days)
        s = _parse_iso_date(start, default_start)
        e = _parse_iso_date(end, now)
        # Make end inclusive of the full day
        e = e + timedelta(days=1)
        return s, e

    # ----- revenue -----

    async def revenue(
        self,
        *,
        business_id: str,
        store_id: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        group_by: str = "day",
    ) -> Dict[str, Any]:
        if group_by not in _VALID_GROUP_BY:
            group_by = "day"
        s, e = self._date_range(start=start, end=end)

        match: Dict[str, Any] = {"businessId": business_id, "createdAt": {"$gte": s, "$lt": e}}
        if store_id:
            match["storeId"] = store_id

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": {
                        "key": {
                            "$dateToString": {
                                "format": self._date_format(group_by),
                                "date": "$createdAt",
                                "timezone": "UTC",
                            }
                        },
                        "storeId": "$storeId",
                        "foodItemId": "$foodItemId",
                    },
                    "revenue": {"$sum": "$totalPrice"},
                    "sales": {"$sum": 1},
                    "quantity": {"$sum": "$quantity"},
                }
            },
        ]
        rows = [r async for r in self.db["sales"].aggregate(pipeline)]

        # Roll up by chosen group dimension.
        buckets: Dict[str, Dict[str, float]] = defaultdict(lambda: {"revenue": 0.0, "sales": 0, "quantity": 0.0})
        total_revenue = 0.0
        total_sales = 0
        total_quantity = 0.0
        for r in rows:
            key_id = r.get("_id") or {}
            bucket_key = key_id.get("key") or "unknown"
            revenue = float(r.get("revenue") or 0)
            sales = int(r.get("sales") or 0)
            qty = float(r.get("quantity") or 0)
            buckets[bucket_key]["revenue"] += revenue
            buckets[bucket_key]["sales"] += sales
            buckets[bucket_key]["quantity"] += qty
            total_revenue += revenue
            total_sales += sales
            total_quantity += qty

        bucket_list = [
            {"key": k, "revenue": round(v["revenue"], 2), "sales": v["sales"], "quantity": round(v["quantity"], 2)}
            for k, v in sorted(buckets.items())
        ]
        return {
            "groupBy": group_by,
            "start": _format_day(s),
            "end": _format_day(e - timedelta(seconds=1)),
            "buckets": bucket_list,
            "total": {
                "revenue": round(total_revenue, 2),
                "sales": total_sales,
                "quantity": round(total_quantity, 2),
            },
        }

    @staticmethod
    def _date_format(group_by: str) -> str:
        if group_by == "month":
            return "%Y-%m"
        if group_by == "week":
            return "%G-W%V"
        return "%Y-%m-%d"

    # ----- profit -----

    async def profit(
        self,
        *,
        business_id: str,
        store_id: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
    ) -> Dict[str, Any]:
        s, e = self._date_range(start=start, end=end)
        match: Dict[str, Any] = {"businessId": business_id, "createdAt": {"$gte": s, "$lt": e}}
        if store_id:
            match["storeId"] = store_id

        sales = [r async for r in self.db["sales"].find(match)]
        total_revenue = sum(float(x.get("totalPrice") or 0) for x in sales)
        total_cost = sum(float(x.get("totalCost") or 0) for x in sales)
        # If legacy sales lack totalCost, fall back to costPerUnit × quantity.
        if total_cost == 0:
            total_cost = sum(float(x.get("costPerUnit") or 0) * float(x.get("quantity") or 0) for x in sales)
        profit = round(total_revenue - total_cost, 2)
        margin = round((profit / total_revenue) * 100, 2) if total_revenue else 0.0

        # Per-store breakdown.
        per_store: Dict[str, Dict[str, float]] = defaultdict(lambda: {"revenue": 0.0, "cost": 0.0, "sales": 0})
        for x in sales:
            sid = str(x.get("storeId") or "unassigned")
            per_store[sid]["revenue"] += float(x.get("totalPrice") or 0)
            per_store[sid]["cost"] += float(x.get("totalCost") or 0) or float(x.get("costPerUnit") or 0) * float(x.get("quantity") or 0)
            per_store[sid]["sales"] += 1

        # Join store names.
        store_names = {str(s.get("id") or s.get("_id")): s.get("name") for s in await self.stores_repo.list(business_id=business_id)}
        by_store = []
        for sid, agg in per_store.items():
            rev = round(agg["revenue"], 2)
            cost = round(agg["cost"], 2)
            pr = round(rev - cost, 2)
            by_store.append({
                "storeId": sid,
                "storeName": store_names.get(sid) or "Unknown",
                "revenue": rev,
                "cost": cost,
                "profit": pr,
                "marginPct": round((pr / rev) * 100, 2) if rev else 0.0,
                "sales": agg["sales"],
            })
        by_store.sort(key=lambda x: x["profit"], reverse=True)

        return {
            "start": _format_day(s),
            "end": _format_day(e - timedelta(seconds=1)),
            "total": {
                "revenue": round(total_revenue, 2),
                "cost": round(total_cost, 2),
                "profit": profit,
                "marginPct": margin,
                "sales": len(sales),
            },
            "byStore": by_store,
        }

    # ----- inventory (turnover, valuation, waste %) -----

    async def inventory(self, *, business_id: str, start: Optional[str] = None, end: Optional[str] = None) -> Dict[str, Any]:
        s, e = self._date_range(start=start, end=end, default_days=30)

        ingredients = await self.ingredients.list(business_id=business_id)
        valuation = 0.0
        per_ingredient: List[Dict[str, Any]] = []
        total_purchased = 0.0
        total_sold_qty = 0.0
        for ing in ingredients:
            stock = float(ing.get("currentStock") or 0)
            cost = float(ing.get("costPerUnit") or ing.get("averageCost") or ing.get("purchasePrice") or 0)
            value = round(stock * cost, 2)
            valuation += value
            per_ingredient.append({
                "ingredientId": ing.get("id"),
                "name": ing.get("name"),
                "category": ing.get("category"),
                "currentStock": stock,
                "unit": ing.get("unit"),
                "costPerUnit": round(cost, 4),
                "valuation": value,
            })

        # Purchases & sales over the window for turnover / waste computation.
        purchase_match = {"businessId": business_id, "createdAt": {"$gte": s, "$lt": e}}
        async for po in self.db["purchase_orders"].find(purchase_match):
            total_purchased += float(po.get("quantity") or 0)

        sales_match = dict(purchase_match)
        async for sale in self.db["sales"].find(sales_match):
            total_sold_qty += float(sale.get("quantity") or 0)

        # Waste: count of inventory_logs where action == WASTE (zero today, but supported).
        waste_qty = 0.0
        async for log in self.db["inventory_logs"].find({
            "businessId": business_id,
            "timestamp": {"$gte": s.isoformat(), "$lt": e.isoformat()},
            "action": "WASTE",
        }):
            waste_qty += abs(float(log.get("quantity") or 0))

        waste_pct = round((waste_qty / total_purchased) * 100, 2) if total_purchased else 0.0
        turnover = round(total_sold_qty / total_purchased, 2) if total_purchased else 0.0
        avg_stock = sum(p["currentStock"] for p in per_ingredient) / max(len(per_ingredient), 1)
        turnover_ratio = round(total_sold_qty / avg_stock, 2) if avg_stock else 0.0

        return {
            "start": _format_day(s),
            "end": _format_day(e - timedelta(seconds=1)),
            "summary": {
                "valuation": round(valuation, 2),
                "turnoverRatio": turnover_ratio,
                "wastePct": waste_pct,
                "ingredientCount": len(per_ingredient),
            },
            "byIngredient": per_ingredient,
        }

    # ----- low-stock (master pool + per-store shelf) -----

    async def low_stock(
        self,
        *,
        business_id: str,
        store_id: Optional[str] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """Return ingredients that are below their minimum stock.

        Two sources are merged so the dashboard reflects the real picture:

        * **Master pool** (``ingredients`` collection): the shared pantry.
          Items where ``currentStock <= minimumStock`` are always considered
          low stock regardless of which store is selected, because replenishing
          the pool is a business-wide concern.
        * **Per-store shelf** (``store_inventory`` collection): when a
          ``store_id`` is provided, also include rows where the shelf quantity
          has dipped below that store's minimum.

        Each row is enriched with the unit cost so the UI can render the dollar
        value of the remaining stock without a second round-trip.
        """
        # 1. Master-pool low stock.
        all_ingredients = await self.ingredients.list(business_id=business_id)
        pool_low: List[Dict[str, Any]] = []
        for ing in all_ingredients:
            minimum = float(ing.get("minimumStock") or 0)
            if minimum <= 0:
                continue
            current = float(ing.get("currentStock") or 0)
            if current > minimum:
                continue
            cost = float(
                ing.get("costPerUnit")
                or ing.get("averageCost")
                or ing.get("purchasePrice")
                or 0
            )
            pool_low.append(
                {
                    "ingredientId": ing.get("id") or str(ing.get("_id", "")),
                    "ingredientName": ing.get("name"),
                    "unit": ing.get("unit"),
                    "category": ing.get("category"),
                    "currentStock": current,
                    "minimumStock": minimum,
                    "costPerUnit": cost,
                    "lineValue": round(current * cost, 2),
                    "source": "pool",
                    "storeId": None,
                }
            )

        # 2. Per-store shelf low stock (only when a store is in scope).
        shelf_low: List[Dict[str, Any]] = []
        if store_id:
            rows = await self.store_inventory.list_low_stock(
                business_id=business_id, store_id=store_id
            )
            for row in rows:
                ing = row.get("ingredient") or {}
                quantity = float(row.get("quantity") or 0)
                minimum = float(row.get("minimumStock") or 0)
                cost = float(
                    ing.get("costPerUnit")
                    or ing.get("averageCost")
                    or row.get("costPerUnit")
                    or 0
                )
                shelf_low.append(
                    {
                        "ingredientId": row.get("ingredientId")
                        or ing.get("id")
                        or str(row.get("_id", "")),
                        "ingredientName": ing.get("name")
                        or row.get("ingredientName")
                        or row.get("ingredientId"),
                        "unit": ing.get("unit") or row.get("unit"),
                        "category": ing.get("category") or row.get("category"),
                        "currentStock": quantity,
                        "minimumStock": minimum,
                        "costPerUnit": cost,
                        "lineValue": round(quantity * cost, 2),
                        "source": "shelf",
                        "storeId": store_id,
                    }
                )

        # De-duplicate by ingredient id (pool + shelf can both flag the same item
        # when a store is selected); prefer the shelf value because it's more
        # actionable for the active store.
        merged: Dict[str, Dict[str, Any]] = {}
        for item in pool_low:
            merged[item["ingredientId"]] = item
        for item in shelf_low:
            merged[item["ingredientId"]] = item

        items = sorted(
            merged.values(),
            key=lambda r: (
                float(r.get("currentStock") or 0) / max(float(r.get("minimumStock") or 1), 1),
                -(r.get("lineValue") or 0),
            ),
        )[:limit]

        total_value = round(sum(float(i.get("lineValue") or 0) for i in items), 2)
        return {
            "items": items,
            "count": len(items),
            "totalValue": total_value,
            "storeId": store_id,
            "sources": {
                "pool": len(pool_low),
                "shelf": len(shelf_low),
            },
        }

    # ----- employees -----

    async def employees(self, *, business_id: str, start: Optional[str] = None, end: Optional[str] = None, limit: int = 25) -> Dict[str, Any]:
        s, e = self._date_range(start=start, end=end)
        # Sales have `servedBy` (worker id). Group by it for productivity.
        pipeline = [
            {"$match": {"businessId": business_id, "createdAt": {"$gte": s, "$lt": e}}},
            {
                "$group": {
                    "_id": "$servedBy",
                    "sales": {"$sum": 1},
                    "revenue": {"$sum": "$totalPrice"},
                    "quantity": {"$sum": "$quantity"},
                }
            },
            {"$sort": {"revenue": -1}},
        ]
        agg_rows = [r async for r in self.db["sales"].aggregate(pipeline)]

        users = await self.users.list(business_id=business_id)
        user_by_id = {str(u.get("id") or u.get("_id")): u for u in users}

        ranking: List[Dict[str, Any]] = []
        note = None
        for r in agg_rows:
            uid = str(r.get("_id") or "")
            if not uid or uid == "None":
                continue
            user = user_by_id.get(uid)
            ranking.append({
                "userId": uid,
                "name": (user or {}).get("name") or "Unknown",
                "email": (user or {}).get("email"),
                "role": (user or {}).get("role"),
                "assignedStore": (user or {}).get("assignedStore"),
                "sales": int(r.get("sales") or 0),
                "revenue": round(float(r.get("revenue") or 0), 2),
                "quantity": round(float(r.get("quantity") or 0), 2),
            })

        if not ranking:
            note = "No sales attributed to employees in this window. The current sale flow doesn't always set servedBy; ranking may be empty until records are tagged."
            # Fallback: rank by active users (zero counts) so the UI shows the team.
            for u in users[:limit]:
                ranking.append({
                    "userId": str(u.get("id") or u.get("_id")),
                    "name": u.get("name"),
                    "email": u.get("email"),
                    "role": u.get("role"),
                    "assignedStore": u.get("assignedStore"),
                    "sales": 0,
                    "revenue": 0,
                    "quantity": 0,
                })

        return {
            "start": _format_day(s),
            "end": _format_day(e - timedelta(seconds=1)),
            "ranking": ranking[:limit],
            "note": note,
        }

    # ----- stores -----

    async def stores(self, *, business_id: str, start: Optional[str] = None, end: Optional[str] = None) -> Dict[str, Any]:
        s, e = self._date_range(start=start, end=end)
        all_stores = await self.stores_repo.list(business_id=business_id)

        # Per-store sales aggregates.
        pipeline = [
            {"$match": {"businessId": business_id, "createdAt": {"$gte": s, "$lt": e}}},
            {
                "$group": {
                    "_id": "$storeId",
                    "sales": {"$sum": 1},
                    "revenue": {"$sum": "$totalPrice"},
                    "quantity": {"$sum": "$quantity"},
                }
            },
        ]
        agg_by_store: Dict[str, Dict[str, float]] = defaultdict(lambda: {"sales": 0, "revenue": 0.0, "quantity": 0.0})
        async for r in self.db["sales"].aggregate(pipeline):
            sid = str(r.get("_id") or "")
            agg_by_store[sid]["sales"] = int(r.get("sales") or 0)
            agg_by_store[sid]["revenue"] = float(r.get("revenue") or 0)
            agg_by_store[sid]["quantity"] = float(r.get("quantity") or 0)

        # Top food per store.
        food_pipeline = [
            {"$match": {"businessId": business_id, "createdAt": {"$gte": s, "$lt": e}}},
            {"$group": {"_id": {"store": "$storeId", "food": "$foodItemId"}, "qty": {"$sum": "$quantity"}}},
            {"$sort": {"qty": -1}},
        ]
        food_agg: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        async for r in self.db["sales"].aggregate(food_pipeline):
            sid = str((r.get("_id") or {}).get("store") or "")
            food_id = str((r.get("_id") or {}).get("food") or "")
            qty = float(r.get("qty") or 0)
            food_agg[sid].append({"foodItemId": food_id, "quantity": qty})

        # Low stock count per store.
        rows: List[Dict[str, Any]] = []
        for store in all_stores:
            sid = str(store.get("id") or store.get("_id"))
            agg = agg_by_store.get(sid, {"sales": 0, "revenue": 0.0, "quantity": 0.0})
            top_food_list = food_agg.get(sid, [])[:3]
            # Resolve names
            for tf in top_food_list:
                food_doc = await self.food_repo.get(business_id=business_id, food_id=tf["foodItemId"])
                tf["name"] = (food_doc or {}).get("name")
            try:
                low_count = len(await self.store_inventory.list_low_stock(business_id=business_id, store_id=sid))
            except Exception:
                low_count = 0
            rows.append({
                "storeId": sid,
                "name": store.get("name"),
                "type": store.get("type"),
                "status": store.get("status"),
                "isActive": store.get("isActive", True),
                "sales": int(agg["sales"]),
                "revenue": round(float(agg["revenue"]), 2),
                "quantity": round(float(agg["quantity"]), 2),
                "lowStockItems": low_count,
                "topFood": top_food_list,
            })

        rows.sort(key=lambda x: x["revenue"], reverse=True)
        return {
            "start": _format_day(s),
            "end": _format_day(e - timedelta(seconds=1)),
            "stores": rows,
        }

    # ----- per-store detail summary (used by store detail panel) -----

    async def get_store_summary(self, *, business_id: str, store_id: str) -> Dict[str, Any]:
        """Aggregate everything an admin needs to see when they open a store detail panel."""
        store = await self.stores_repo.get(business_id=business_id, store_id=store_id)

        now = datetime.now(timezone.utc)
        day_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1) - timedelta(milliseconds=1)
        week_start = day_start - timedelta(days=6)
        month_start = day_start - timedelta(days=29)

        async def _window_sales(start: datetime, end: datetime) -> Dict[str, float]:
            sales_rows = await self.sales.list(business_id=business_id, store_id=store_id, start=start, end=end, limit=2000)
            count = len(sales_rows)
            revenue = 0.0
            for row in sales_rows:
                revenue += float(row.get("totalPrice") or 0)
            return {"sales": count, "revenue": round(revenue, 2), "orders": count}

        today = await _window_sales(day_start, day_end)
        last7 = await _window_sales(week_start, day_end)
        last30 = await _window_sales(month_start, day_end)

        # Reuse the profit() aggregation scoped to this store
        profit_payload = await self.profit(business_id=business_id, start=_format_day(month_start), end=_format_day(now))
        store_profit_row = next((row for row in profit_payload.get("byStore", []) if row.get("storeId") == store_id), None)
        profit_30d = {
            "revenue": float((store_profit_row or {}).get("revenue") or 0),
            "cost": float((store_profit_row or {}).get("cost") or 0),
            "profit": float((store_profit_row or {}).get("profit") or 0),
            "marginPct": float((store_profit_row or {}).get("marginPct") or 0),
            "sales": int((store_profit_row or {}).get("sales") or 0),
        }

        # Active allocations in last 30d
        from app.repositories.allocation_repository import AllocationRepository
        allocations_repo = AllocationRepository(self.db)
        alloc_rows = await allocations_repo.list(
            business_id=business_id,
            store_id=store_id,
            start_date=_format_day(month_start),
            end_date=_format_day(now),
            status="ACTIVE",
            limit=200,
        )
        allocations_summary: List[Dict[str, Any]] = []
        for alloc in alloc_rows:
            sold = await allocations_repo.sold_for_allocation(allocation=alloc)
            qty = float(alloc.get("quantity") or 0)
            unit_price = float(alloc.get("unitPrice") or 0)
            total_cost = float(alloc.get("totalCost") or 0)
            remaining = max(qty - sold, 0)
            revenue = round(sold * unit_price, 2)
            profit = round(revenue - (total_cost * (sold / qty if qty else 0)), 2)
            allocations_summary.append({
                "id": alloc.get("id"),
                "foodId": alloc.get("foodItemId"),
                "foodName": alloc.get("foodName"),
                "date": alloc.get("date"),
                "allocated": qty,
                "sold": sold,
                "remaining": remaining,
                "unitPrice": unit_price,
                "revenue": revenue,
                "profit": profit,
                "totalCost": total_cost,
                "status": alloc.get("status"),
            })

        # Employees assigned to this store
        employees_rows = await self.users.list(business_id=business_id, store_id=store_id)

        # Top food at this store by revenue (last 30d)
        sales_30 = await self.sales.list(business_id=business_id, store_id=store_id, start=month_start, end=day_end, limit=2000)
        by_food: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"quantity": 0, "revenue": 0.0})
        for row in sales_30:
            fid = row.get("foodItemId") or "unknown"
            by_food[fid]["foodId"] = fid
            by_food[fid]["name"] = row.get("foodName") or fid
            by_food[fid]["quantity"] += int(row.get("quantity") or 0)
            by_food[fid]["revenue"] += float(row.get("totalPrice") or 0)
        top_food = sorted(
            [
                {
                    "foodId": v.get("foodId"),
                    "name": v.get("name"),
                    "quantity": v.get("quantity", 0),
                    "revenue": round(v.get("revenue", 0), 2),
                }
                for v in by_food.values()
            ],
            key=lambda row: row["revenue"],
            reverse=True,
        )[:5]

        # Low stock for this store (only meaningful if store_inventory has rows)
        low_stock = await self.store_inventory.list_low_stock(business_id=business_id, store_id=store_id)

        return {
            "store": store,
            "today": today,
            "last7": last7,
            "last30": last30,
            "profit30d": profit_30d,
            "allocations": allocations_summary,
            "employees": employees_rows,
            "topFood": top_food,
            "totals": {
                "allocatedCount": len(allocations_summary),
                "activeEmployeesCount": sum(1 for e in employees_rows if e.get("isActive", True)),
                "lowStockItems": len(low_stock),
            },
        }

    # ----- food -----

    async def food(self, *, business_id: str, start: Optional[str] = None, end: Optional[str] = None, top_n: int = 10) -> Dict[str, Any]:
        s, e = self._date_range(start=start, end=end)
        pipeline = [
            {"$match": {"businessId": business_id, "createdAt": {"$gte": s, "$lt": e}}},
            {
                "$group": {
                    "_id": "$foodItemId",
                    "quantity": {"$sum": "$quantity"},
                    "revenue": {"$sum": "$totalPrice"},
                    "sales": {"$sum": 1},
                }
            },
        ]
        rows = [r async for r in self.db["sales"].aggregate(pipeline)]
        items: List[Dict[str, Any]] = []
        for r in rows:
            fid = str(r.get("_id") or "")
            if not fid or fid == "None":
                continue
            food_doc = await self.food_repo.get(business_id=business_id, food_id=fid)
            items.append({
                "foodItemId": fid,
                "name": (food_doc or {}).get("name") or "Unknown",
                "category": (food_doc or {}).get("category"),
                "quantity": round(float(r.get("quantity") or 0), 2),
                "revenue": round(float(r.get("revenue") or 0), 2),
                "sales": int(r.get("sales") or 0),
            })
        items.sort(key=lambda x: x["quantity"], reverse=True)
        top = items[:top_n]
        low = sorted(items, key=lambda x: x["quantity"])[:top_n]
        return {
            "start": _format_day(s),
            "end": _format_day(e - timedelta(seconds=1)),
            "topSellers": top,
            "lowPerformers": low,
        }

    # ----- report builder (CSV export) -----

    async def build_report(
        self,
        *,
        business_id: str,
        name: str,
        store_id: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        group_by: str = "day",
    ) -> Dict[str, Any]:
        """Return a dict ``{headers: [...], rows: [[...], ...]}`` for a given report name."""
        name = (name or "").lower().strip()
        if name == "revenue":
            data = await self.revenue(business_id=business_id, store_id=store_id, start=start, end=end, group_by=group_by)
            headers = ["bucket", "revenue", "sales", "quantity"]
            rows = [[b["key"], b["revenue"], b["sales"], b["quantity"]] for b in data["buckets"]]
            return {"headers": headers, "rows": rows}
        if name == "profit":
            data = await self.profit(business_id=business_id, store_id=store_id, start=start, end=end)
            headers = ["storeId", "storeName", "revenue", "cost", "profit", "marginPct", "sales"]
            rows = [[r["storeId"], r["storeName"], r["revenue"], r["cost"], r["profit"], r["marginPct"], r["sales"]] for r in data["byStore"]]
            return {"headers": headers, "rows": rows}
        if name == "inventory":
            data = await self.inventory(business_id=business_id, start=start, end=end)
            headers = ["ingredientId", "name", "category", "currentStock", "unit", "costPerUnit", "valuation"]
            rows = [
                [r["ingredientId"], r["name"], r.get("category"), r["currentStock"], r.get("unit"), r["costPerUnit"], r["valuation"]]
                for r in data["byIngredient"]
            ]
            return {"headers": headers, "rows": rows}
        if name == "employees":
            data = await self.employees(business_id=business_id, start=start, end=end)
            headers = ["userId", "name", "email", "role", "assignedStore", "sales", "revenue", "quantity"]
            rows = [
                [r["userId"], r["name"], r.get("email"), r.get("role"), r.get("assignedStore"), r["sales"], r["revenue"], r["quantity"]]
                for r in data["ranking"]
            ]
            return {"headers": headers, "rows": rows}
        if name == "stores":
            data = await self.stores(business_id=business_id, start=start, end=end)
            headers = ["storeId", "name", "type", "status", "sales", "revenue", "quantity", "lowStockItems"]
            rows = [
                [r["storeId"], r["name"], r.get("type"), r.get("status"), r["sales"], r["revenue"], r["quantity"], r["lowStockItems"]]
                for r in data["stores"]
            ]
            return {"headers": headers, "rows": rows}
        if name == "food":
            data = await self.food(business_id=business_id, start=start, end=end)
            headers = ["rank", "foodItemId", "name", "category", "quantity", "revenue", "sales"]
            rows = []
            for i, r in enumerate(data["topSellers"], 1):
                rows.append([f"top-{i}", r["foodItemId"], r["name"], r.get("category"), r["quantity"], r["revenue"], r["sales"]])
            for i, r in enumerate(data["lowPerformers"], 1):
                rows.append([f"low-{i}", r["foodItemId"], r["name"], r.get("category"), r["quantity"], r["revenue"], r["sales"]])
            return {"headers": headers, "rows": rows}
        return {"headers": [], "rows": [], "error": f"Unknown report '{name}'"}

    @staticmethod
    def to_csv(*, headers: List[str], rows: List[List[Any]]) -> str:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)
        return buf.getvalue()