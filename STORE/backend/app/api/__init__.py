from fastapi import APIRouter

from app.api.ai import router as ai_router
from app.api.allocations import router as allocations_router
from app.api.analytics import router as analytics_router
from app.api.attendance import router as attendance_router
from app.api.attendance_records import router as attendance_records_router
from app.api.auth import router as auth_router
from app.api.food import router as food_router
from app.api.forecast import router as forecast_router
from app.api.inventory import router as inventory_router
from app.api.mcp import router as mcp_router
from app.api.notifications import router as notifications_router
from app.api.recipes import router as recipes_router
from app.api.reports import router as reports_router
from app.api.sales import router as sales_router
from app.api.store_inventory import router as store_inventory_router
from app.api.stores import router as stores_router
from app.api.tickets import router as tickets_router
from app.api.users import router as users_router
from app.api.ws import router as ws_router


api_router = APIRouter(prefix="/api/v1")
api_router.include_router(ws_router)
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(stores_router)
api_router.include_router(inventory_router)
api_router.include_router(recipes_router)
api_router.include_router(food_router)
api_router.include_router(store_inventory_router, prefix="/store-inventory")
api_router.include_router(sales_router, prefix="/sales")
api_router.include_router(attendance_router, prefix="/assignments")
api_router.include_router(attendance_records_router)
api_router.include_router(allocations_router)
api_router.include_router(forecast_router, prefix="/forecasts")
api_router.include_router(tickets_router)
api_router.include_router(reports_router)
api_router.include_router(analytics_router)
api_router.include_router(notifications_router)
api_router.include_router(ai_router)
api_router.include_router(mcp_router)
