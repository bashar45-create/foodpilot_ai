from __future__ import annotations


QUICK_PROMPTS = [
    {
        "id": "today-sales",
        "label": "Today's total sales",
        "prompt": "What were today's total sales?",
        "category": "Sales",
    },
    {
        "id": "top-sellers",
        "label": "Top selling items",
        "prompt": "What are my top 5 selling items this week?",
        "category": "Sales",
    },
    {
        "id": "sales-by-store",
        "label": "Sales by store",
        "prompt": "How much did each store sell this week?",
        "category": "Sales",
    },
    {
        "id": "payment-methods",
        "label": "Sales by payment method",
        "prompt": "Break down today's sales by payment method.",
        "category": "Sales",
    },
    {
        "id": "low-stock",
        "label": "Low stock items",
        "prompt": "Which ingredients are running low right now?",
        "category": "Inventory",
    },
    {
        "id": "restock",
        "label": "Restock for tomorrow",
        "prompt": "How much should I restock for tomorrow?",
        "category": "Inventory",
    },
    {
        "id": "ingredient-search",
        "label": "Check a specific ingredient",
        "prompt": "What is the current stock of flour?",
        "category": "Inventory",
    },
    {
        "id": "stores-compare",
        "label": "Compare stores",
        "prompt": "How are my stores performing compared to each other?",
        "category": "Stores",
    },
    {
        "id": "stores-status",
        "label": "Open / closed stores",
        "prompt": "Which stores are currently open vs closed?",
        "category": "Stores",
    },
    {
        "id": "allocate-per-store",
        "label": "How much to allocate per store",
        "prompt": "How much of each ingredient should I allocate to each store tomorrow based on recent sales?",
        "category": "Stores",
    },
    {
        "id": "profit",
        "label": "Profit last 30 days",
        "prompt": "What is my profit per store for the last 30 days?",
        "category": "Finance",
    },
    {
        "id": "recipe-cost",
        "label": "Recipe cost",
        "prompt": "What is the estimated cost of my most-used recipe?",
        "category": "Recipes",
    },
    {
        "id": "top-employee",
        "label": "Top employee",
        "prompt": "Which employee made the most sales this month?",
        "category": "Employees",
    },
]


def _normalise_prompt(entry) -> dict[str, str]:
    """Accept either a dict-shaped prompt or a plain string for backwards compat."""
    if isinstance(entry, dict):
        return {
            "id": str(entry.get("id") or entry.get("label") or entry.get("prompt", "")),
            "label": str(entry.get("label") or entry.get("prompt", "")),
            "prompt": str(entry.get("prompt") or entry.get("label") or ""),
            "category": str(entry.get("category") or "General"),
        }
    text = str(entry)
    return {
        "id": text,
        "label": text,
        "prompt": text,
        "category": "General",
    }


def get_quick_prompts() -> list[dict[str, str]]:
    return [_normalise_prompt(p) for p in QUICK_PROMPTS]


SYSTEM_PROMPT = """
You are STORE AI, an operational assistant for STORE ERP — a multi-store restaurant / retail platform.

You have access to the following read-only tools. ALWAYS call one or more of these tools before answering any question that involves numbers, dates, stock, sales, stores, recipes, or employees.

Available tools:
- get_sales_summary(date_range, store_id?)         — revenue, profit, and transaction count.
- get_top_selling_items(date_range, store_id?, limit?) — top food items by quantity and revenue.
- get_sales_by_payment_method(date_range, store_id?)   — revenue per payment method.
- get_current_stock(ingredient_name?, store_id?)       — current stock levels and low-stock flags.
- get_low_stock_items(store_id?)                       — ingredients where currentStock ≤ minimumStock.
- get_stock_history(ingredient_name, date_range?, store_id?) — recent inventory ledger entries.
- suggest_restock_quantities(store_id?, days_ahead?)   — restock suggestions from trailing 7-day avg.
- get_recipe_ingredients(recipe_name_or_id)            — ingredient list for a recipe.
- get_recipe_cost(recipe_name_or_id)                    — estimated recipe cost from ingredient average costs.
- compare_store_performance(date_range)                — store-vs-store revenue, profit, transactions.
- get_store_status(store_id?)                          — open / closed status for stores.
- get_employee_performance(employee_name_or_id, date_range?) — sales attributed to one employee.

Rules:
1. You are scoped to the current authenticated business. NEVER mention other businesses.
2. For ANY numeric, date, stock, sales, recipe, employee, or store question: call tools first and ground your answer in tool output. Do NOT fabricate numbers.
3. Choose the smallest set of tool calls needed. If the user asks for "today's sales", call get_sales_summary(date_range="today").
4. If a tool returns no data or fails, say so clearly and suggest what to do (e.g. "no sales recorded today — start recording sales to populate the dashboard").
5. This is v1 — read-only. If the user asks to mutate data (create, update, delete), explain that the assistant cannot make changes and point them to the relevant dashboard page (e.g. "/inventory", "/sales").
6. Keep answers concise, operational, and actionable. Use bullets / tables when comparing items.
7. When the user asks about a date range ("today", "yesterday", "this week", "last 7 days", "last 30 days"), pass the appropriate keyword directly to the tool — the tool handles the conversion.
8. When the user asks about an ingredient, recipe, store, or employee by name, pass it as the relevant string argument (substring match is fine).
9. Cite the tool you used inline so the user trusts the answer (e.g. "via get_low_stock_items").
10. Respond in the same language the user wrote in.
""".strip()
