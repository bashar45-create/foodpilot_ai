from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.response import success_payload
from app.database.client import get_database_dependency
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.user import UserAssignStoreRequest, UserCreateRequest, UserResetPasswordRequest, UserStatusUpdateRequest, UserUpdateRequest
from app.services.user_service import InvalidRoleError, UserConflictError, UserNotFoundError, UserService

router = APIRouter(prefix="/users", tags=["users"])


def _service(db: AsyncIOMotorDatabase = Depends(get_database_dependency)) -> UserService:
    return UserService(db)


async def _role_guard(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role not in {"OWNER", "MANAGER"}:
        raise ForbiddenError(details={"allowedRoles": ["OWNER", "MANAGER"], "currentRole": current_user.role})
    return current_user


def _bid(current_user: CurrentUser) -> str:
    return current_user.businessId or "business-default"


@router.get("")
async def list_users(
    role: str | None = Query(default=None),
    storeId: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    current_user: CurrentUser = Depends(_role_guard),
    service: UserService = Depends(_service),
):
    items = await service.list_users(business_id=_bid(current_user), role=role, store_id=storeId, active=active)
    return success_payload(items)


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    current_user: CurrentUser = Depends(_role_guard),
    service: UserService = Depends(_service),
):
    try:
        item = await service.get_user(business_id=_bid(current_user), user_id=user_id)
    except UserNotFoundError:
        raise NotFoundError("USER_NOT_FOUND", "User not found")
    return success_payload(item)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreateRequest,
    current_user: CurrentUser = Depends(_role_guard),
    service: UserService = Depends(_service),
):
    payload: dict[str, Any] = body.model_dump()
    pwd = getattr(body, "password", None) or "changeme123"
    payload["password"] = pwd
    try:
        item = await service.create_user(business_id=_bid(current_user), payload=payload, actor_user_id=current_user.userId or "")
    except UserConflictError as exc:
        raise ConflictError("USER_EXISTS", f"User '{exc}' already exists")
    except InvalidRoleError as exc:
        raise ConflictError("INVALID_ROLE", f"Role '{exc}' is not allowed")
    except ValueError as exc:
        raise ConflictError("VALIDATION_ERROR", str(exc))
    return success_payload(item, message="User created")


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdateRequest,
    current_user: CurrentUser = Depends(_role_guard),
    service: UserService = Depends(_service),
):
    payload = body.model_dump(exclude_none=True)
    try:
        item = await service.update_user(business_id=_bid(current_user), user_id=user_id, payload=payload, actor_user_id=current_user.userId or "")
    except UserNotFoundError:
        raise NotFoundError("USER_NOT_FOUND", "User not found")
    except UserConflictError as exc:
        raise ConflictError("USER_EXISTS", f"User '{exc}' already exists")
    except InvalidRoleError as exc:
        raise ConflictError("INVALID_ROLE", f"Role '{exc}' is not allowed")
    except ValueError as exc:
        raise ConflictError("VALIDATION_ERROR", str(exc))
    return success_payload(item)


@router.patch("/{user_id}/status")
async def change_status(
    user_id: str,
    body: UserStatusUpdateRequest,
    current_user: CurrentUser = Depends(_role_guard),
    service: UserService = Depends(_service),
):
    try:
        item = await service.change_status(business_id=_bid(current_user), user_id=user_id, is_active=body.isActive, actor_user_id=current_user.userId or "")
    except UserNotFoundError:
        raise NotFoundError("USER_NOT_FOUND", "User not found")
    return success_payload(item)


@router.patch("/{user_id}/assign-store")
async def assign_store(
    user_id: str,
    body: UserAssignStoreRequest,
    current_user: CurrentUser = Depends(_role_guard),
    service: UserService = Depends(_service),
):
    try:
        item = await service.assign_store(business_id=_bid(current_user), user_id=user_id, store_id=body.storeId, actor_user_id=current_user.userId or "")
    except UserNotFoundError:
        raise NotFoundError("USER_NOT_FOUND", "User not found")
    return success_payload(item)


@router.patch("/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    body: UserResetPasswordRequest,
    current_user: CurrentUser = Depends(_role_guard),
    service: UserService = Depends(_service),
):
    # Accept both `newPassword` (preferred) and `password` (legacy) to stay
    # forgiving for older frontend clients. The service falls back to a
    # generated temporary password when neither is supplied.
    new_pwd = (body.newPassword or body.password or "").strip() or None
    try:
        await service.reset_password(
            business_id=_bid(current_user),
            user_id=user_id,
            new_password=new_pwd,
            actor_user_id=current_user.userId or "",
        )
    except UserNotFoundError:
        raise NotFoundError("USER_NOT_FOUND", "User not found")
    # Echo the temporary password so the manager UI can show it to the user.
    return success_payload({"reset": True, "temporary": new_pwd or "changeme123"})
