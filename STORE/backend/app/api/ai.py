from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from app.core.response import success_payload
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.ai import AIChatRequest, AIConversationCreateRequest, AIConversationUpdateRequest
from app.services.ai_service import AIService


router = APIRouter(prefix="/ai", tags=["ai"])
service = AIService()


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_ai_conversation(payload: AIConversationCreateRequest, current_user: CurrentUser = Depends(get_current_user)):
    conversation = await service.create_conversation(
        business_id=current_user.businessId or "",
        user_id=current_user.userId or "",
        initial_message=payload.initialMessage,
    )
    return success_payload(conversation, message="Conversation created")


@router.get("/conversations")
async def list_ai_conversations(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List conversations owned by the current user.

    Returns ``{items: [...], meta: {page, limit, total}}`` so the frontend can
    paginate without losing the total count. The standard success envelope is
    preserved around it (``{success, data, meta}``).
    """
    result = await service.list_conversations(
        business_id=current_user.businessId or "",
        user_id=current_user.userId or "",
        page=page,
        limit=limit,
    )
    return success_payload({"items": result["items"], "meta": result["meta"]})


@router.get("/conversations/{conversation_id}")
async def get_ai_conversation(conversation_id: str, current_user: CurrentUser = Depends(get_current_user)):
    data = await service.get_conversation(
        conversation_id=conversation_id,
        business_id=current_user.businessId or "",
        user_id=current_user.userId or "",
    )
    return success_payload(data)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_200_OK)
async def delete_ai_conversation(conversation_id: str, current_user: CurrentUser = Depends(get_current_user)):
    await service.delete_conversation(
        conversation_id=conversation_id,
        business_id=current_user.businessId or "",
        user_id=current_user.userId or "",
    )
    return success_payload({}, message="Conversation deleted")


@router.patch("/conversations/{conversation_id}")
async def update_ai_conversation(
    conversation_id: str,
    payload: AIConversationUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    conversation = await service.update_conversation(
        conversation_id=conversation_id,
        business_id=current_user.businessId or "",
        user_id=current_user.userId or "",
        title=payload.title,
    )
    return success_payload(conversation, message="Conversation updated")


@router.post("/chat")
async def ai_chat(payload: AIChatRequest, current_user: CurrentUser = Depends(get_current_user)):
    data = await service.chat(
        business_id=current_user.businessId or "",
        user_id=current_user.userId or "",
        role=current_user.role,
        message=payload.message,
        conversation_id=payload.conversationId,
    )
    return success_payload(data)


@router.get("/quick-prompts")
async def get_quick_prompts(_: CurrentUser = Depends(get_current_user)):
    data = await service.quick_prompts()
    return success_payload(data)
