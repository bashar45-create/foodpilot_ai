from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):  # type: ignore[override]
        return await call_next(request)
