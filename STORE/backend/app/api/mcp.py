from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.response import success_payload
from app.dependencies.auth import CurrentUser, get_current_user
from app.database.client import get_database
from app.schemas.mcp import McpAggregateRequest, McpCountRequest, McpFindRequest
from app.services.mcp_service import McpService


router = APIRouter(prefix="/mcp", tags=["mcp"])


def _service() -> McpService:
    return McpService(get_database())


@router.get("/manifest")
async def mcp_manifest(_: CurrentUser = Depends(get_current_user)):
    """Static manifest describing the read-only bridge: tools, allowed
    collections, blocked operators, and limits. Mirrors the introspection
    surface of the MongoDB MCP server so any MCP-compatible client can be
    pointed at /api/v1/mcp/* safely."""
    return success_payload(McpService.manifest(), message="Read-only MCP manifest")


@router.get("/status")
async def mcp_status(_: CurrentUser = Depends(get_current_user)):
    return success_payload(await _service().server_status(), message="MongoDB status")


@router.get("/collections")
async def mcp_collections(current_user: CurrentUser = Depends(get_current_user)):
    cols = await _service().list_collections(business_id=current_user.businessId or "")
    return success_payload(cols, message="Collections")


@router.get("/collections/{collection}/indexes")
async def mcp_indexes(collection: str, current_user: CurrentUser = Depends(get_current_user)):
    idx = await _service().list_indexes(
        business_id=current_user.businessId or "",
        collection=collection,
    )
    return success_payload(idx, message="Indexes")


@router.post("/find")
async def mcp_find(payload: McpFindRequest, current_user: CurrentUser = Depends(get_current_user)):
    sort_pairs: list[tuple[str, int]] = []
    if payload.sort:
        for entry in payload.sort:
            for k, v in entry.items():
                sort_pairs.append((k, int(v)))
    docs = await _service().find(
        business_id=current_user.businessId or "",
        collection=payload.collection,
        filter=payload.filter,
        projection=payload.projection,
        sort=sort_pairs or None,
        limit=payload.limit,
    )
    return success_payload(docs, message=f"{len(docs)} document(s)")


@router.post("/count")
async def mcp_count(payload: McpCountRequest, current_user: CurrentUser = Depends(get_current_user)):
    total = await _service().count(
        business_id=current_user.businessId or "",
        collection=payload.collection,
        filter=payload.filter,
    )
    return success_payload({"count": total}, message="Count")


@router.post("/aggregate")
async def mcp_aggregate(payload: McpAggregateRequest, current_user: CurrentUser = Depends(get_current_user)):
    docs = await _service().aggregate(
        business_id=current_user.businessId or "",
        collection=payload.collection,
        pipeline=payload.pipeline,
        limit=payload.limit,
    )
    return success_payload(docs, message=f"{len(docs)} result(s)")