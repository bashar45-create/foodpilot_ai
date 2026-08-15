from __future__ import annotations

import math
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from app.repositories.food_repository import FoodRepository
from app.repositories.sale_repository import SaleRepository


# Weighted baseline: most recent 7 days weighted highest; decays further back.
_BASELINE_DAYS = 28
_W_WEIGHTS = (0.5, 0.3, 0.2)  # last 7 / next 7 / prior 14


class ForecastService:
    def __init__(self, db: Any) -> None:
        self.db = db
        self.food = FoodRepository(db)
        self.sales = SaleRepository(db)

    async def daily_forecast(self, *, business_id: str, days: int = 7) -> List[Dict[str, Any]]:
        """Legacy per-food moving-average forecast. Returns one row per food item.

        Kept for backward compatibility with `/forecast` page.
        Use ``projected_daily`` for the new per-day shape consumed by the dashboard.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)
        aggregates = await self.sales.aggregate_quantity(business_id=business_id, since=since)
        by_food: Dict[str, Dict[str, Any]] = {}
        for agg in aggregates:
            food_id = str(agg.get("_id"))
            if not food_id or food_id == "None":
                continue
            by_food[food_id] = {
                "foodItemId": food_id,
                "totalQuantity": float(agg.get("totalQuantity") or 0),
                "totalRevenue": float(agg.get("totalRevenue") or 0),
            }
        items = []
        for food_id, agg in by_food.items():
            avg = agg["totalQuantity"] / float(days) if days else 0
            food = await self.food.get(business_id=business_id, food_id=food_id)
            items.append({
                "foodItemId": food_id,
                "name": (food or {}).get("name"),
                "category": (food or {}).get("category"),
                "averageQuantity": round(avg, 2),
                "predictedQuantity": int(math.ceil(avg)),
                "totalRevenue": round(agg["totalRevenue"], 2),
                "basedOnDays": days,
            })
        items.sort(key=lambda x: x.get("predictedQuantity", 0), reverse=True)
        return items

    async def projected_daily(
        self,
        *,
        business_id: str,
        days: int = 7,
        top_n: int = 10,
        store_id: str | None = None,
    ) -> Dict[str, Any]:
        """Per-day forecast for the next ``days`` days for the top ``top_n`` food items.

        Strategy:
        1. Aggregate sales into per-day buckets for the last ``_BASELINE_DAYS`` days.
        2. Compute a weighted daily average (recent days weighted higher).
        3. Project that average forward for each of the next ``days`` days.

        Response shape (consumed by the dashboard's 7-day bar chart):
            {
              "days": ["2026-07-05", ..., "2026-07-12"],
              "startDate": "...",
              "endDate": "...",
              "basisDays": 28,
              "items": [
                {
                  "foodItemId": "...",
                  "name": "...",
                  "category": "...",
                  "weightedAverage": float,
                  "daily": [{"date": "...", "predictedQuantity": int}, ...],
                  "totalPredicted": int,
                }, ...
              ],
              "legacy": [...]   # backward-compatible list from daily_forecast()
            }
        """
        now = datetime.now(timezone.utc)
        today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        baseline_start = today - timedelta(days=_BASELINE_DAYS)

        # Pull daily totals per food over the baseline window.
        daily_buckets = await self._aggregate_daily(
            business_id=business_id, start=baseline_start, end=now, store_id=store_id
        )

        # Compute weighted average per food.
        weighted: Dict[str, float] = {}
        for food_id, by_date in daily_buckets.items():
            weighted[food_id] = self._weighted_avg(by_date, baseline_start, today)

        # Top-N by weighted average.
        top_food_ids = sorted(weighted.keys(), key=lambda fid: weighted[fid], reverse=True)[:top_n]

        # Build response: for each top food, compute next `days` day predictions.
        items: List[Dict[str, Any]] = []
        for food_id in top_food_ids:
            food = await self.food.get(business_id=business_id, food_id=food_id)
            avg = weighted[food_id]
            per_day: List[Dict[str, Any]] = []
            total = 0
            for offset in range(1, days + 1):
                d = today + timedelta(days=offset)
                predicted = int(math.ceil(avg))
                per_day.append({"date": d.strftime("%Y-%m-%d"), "predictedQuantity": predicted})
                total += predicted
            items.append({
                "foodItemId": food_id,
                "name": (food or {}).get("name") or "Unknown",
                "category": (food or {}).get("category"),
                "weightedAverage": round(avg, 2),
                "daily": per_day,
                "totalPredicted": total,
            })

        # Future date range (today+1 ... today+days)
        future_dates = [(today + timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(days)]

        return {
            "days": future_dates,
            "startDate": future_dates[0] if future_dates else None,
            "endDate": future_dates[-1] if future_dates else None,
            "basisDays": _BASELINE_DAYS,
            "items": items,
            "legacy": await self.daily_forecast(business_id=business_id, days=days),
        }

    # ----- internals -----

    async def _aggregate_daily(
        self,
        *,
        business_id: str,
        start: datetime,
        end: datetime,
        store_id: str | None = None,
    ) -> Dict[str, Dict[str, float]]:
        """Group sales by (foodItemId, YYYY-MM-DD) returning {foodId: {date: quantity}}."""
        match: Dict[str, Any] = {"businessId": business_id, "createdAt": {"$gte": start, "$lte": end}}
        if store_id:
            match["storeId"] = store_id
        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": {
                        "food": "$foodItemId",
                        "day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt", "timezone": "UTC"}},
                    },
                    "qty": {"$sum": "$quantity"},
                }
            },
        ]
        out: Dict[str, Dict[str, float]] = {}
        async for row in self.db["sales"].aggregate(pipeline):
            food_id = str((row.get("_id") or {}).get("food") or "")
            day = (row.get("_id") or {}).get("day")
            if not food_id or not day or food_id == "None":
                continue
            out.setdefault(food_id, {})[day] = float(row.get("qty") or 0)
        return out

    def _weighted_avg(self, by_date: Dict[str, float], start: datetime, end: datetime) -> float:
        """Weighted moving average across the baseline window.

        Split the window into three sub-windows (most recent 7d / prior 7d / prior 14d)
        and weight each by ``_W_WEIGHTS``. Days without data contribute 0.
        """
        # Build per-day series, sorted oldest -> newest, within [start, end].
        per_day: List[float] = []
        cur = start
        while cur <= end:
            key = cur.strftime("%Y-%m-%d")
            per_day.append(float(by_date.get(key, 0)))
            cur += timedelta(days=1)

        n = len(per_day)
        if n == 0:
            return 0.0

        # Three buckets: last 7 / next 7 / prior rest
        last7 = sum(per_day[-7:]) / 7.0 if n >= 7 else (sum(per_day) / max(n, 1))
        next7 = sum(per_day[-14:-7]) / 7.0 if n >= 14 else 0.0
        prior = sum(per_day[:-14]) / max(n - 14, 1) if n > 14 else 0.0

        w_recent, w_mid, w_old = _W_WEIGHTS
        return w_recent * last7 + w_mid * next7 + w_old * prior