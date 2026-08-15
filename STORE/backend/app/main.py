from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.core.exceptions import AppException
from app.core.response import error_payload, success_payload
from app.api import api_router
from app.database.client import mongo_manager


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", openapi_url="/openapi.json", docs_url="/docs", redoc_url="/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.exception_handler(AppException)
async def app_exception_handler(_: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=error_payload(exc.code, exc.message, details=exc.details))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content=error_payload("VALIDATION_ERROR", "Request validation failed", details={"errors": exc.errors()}))


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content=error_payload("INTERNAL_SERVER_ERROR", "An unexpected error occurred"))


@app.on_event("startup")
async def startup() -> None:
    mongo_manager.client()
    export_openapi_schema()


@app.on_event("shutdown")
async def shutdown() -> None:
    await mongo_manager.close()


def export_openapi_schema() -> None:
    docs_path = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"
    docs_path.write_text(json.dumps(app.openapi(), indent=2), encoding="utf-8")


@app.get("/api/v1/health", tags=["system"])
async def health_check() -> dict[str, object]:
    return success_payload({"status": "ok"}, message="STORE backend is running")
