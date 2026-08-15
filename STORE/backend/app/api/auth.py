from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.core.exceptions import AppException, UnauthorizedError
from app.core.response import success_payload
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    verify_password,
)
from app.database.client import get_database_dependency
from app.dependencies.auth import CurrentUser, get_current_user
from app.repositories.user_repository import UserRepository
from app.schemas.auth import ChangePasswordRequest, ForgotPasswordRequest, LoginRequest, RefreshTokenRequest, RegisterRequest, ResetPasswordRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _bundle(payload: dict[str, Any]) -> dict[str, Any]:
    access = create_access_token(payload)
    refresh = create_refresh_token({"sub": payload["sub"], "type": "refresh"})
    return {
        "accessToken": access,
        "refreshToken": refresh,
        "user": {
            "userId": payload["sub"],
            "businessId": payload.get("businessId"),
            "role": payload.get("role"),
            "assignedStore": payload.get("assignedStore"),
            "name": payload.get("name"),
            "email": payload.get("email"),
        },
    }


def _repo(db: AsyncIOMotorDatabase = Depends(get_database_dependency)) -> UserRepository:
    return UserRepository(db)


@router.post("/login")
async def login(payload: LoginRequest, repo: UserRepository = Depends(_repo)):
    settings = get_settings()
    username = (payload.username or "").strip().lower()
    pwd = payload.password
    is_admin = username == settings.admin_username.lower() and pwd == settings.admin_password
    if is_admin:
        bundle_payload = {
            "sub": "admin-hardcoded",
            "businessId": settings.hardcoded_business_id,
            "role": "OWNER",
            "assignedStore": None,
            "name": settings.hardcoded_admin_name,
            "email": username,
        }
        return success_payload(_bundle(bundle_payload), message="Login successful")
    user = await repo.find_by_email_any_business(email=username)
    if not user or not user.get("isActive", True):
        raise UnauthorizedError(code="UNAUTHORIZED", message="Invalid username or password")
    if not verify_password(pwd, user.get("passwordHash", "")):
        raise UnauthorizedError(code="UNAUTHORIZED", message="Invalid username or password")
    from datetime import datetime, timezone
    await repo.collection.update_one({"_id": user["_id"]}, {"$set": {"lastLogin": datetime.now(timezone.utc)}})
    bundle_payload = {
        "sub": str(user["_id"]),
        "businessId": user.get("businessId"),
        "role": user.get("role"),
        "assignedStore": user.get("assignedStore"),
        "name": user.get("name"),
        "email": user.get("email"),
    }
    return success_payload(_bundle(bundle_payload), message="Login successful")


@router.post("/refresh-token")
async def refresh_token(payload: RefreshTokenRequest):
    try:
        refresh_payload = decode_refresh_token(payload.refreshToken)
    except TokenError as exc:
        raise UnauthorizedError(code="UNAUTHORIZED", message="Invalid refresh token") from exc
    if refresh_payload.get("type") != "refresh":
        raise UnauthorizedError(code="UNAUTHORIZED", message="Invalid refresh token")
    sub = refresh_payload.get("sub")
    if not sub:
        raise UnauthorizedError(code="UNAUTHORIZED", message="Invalid refresh token")
    if sub == "admin-hardcoded":
        settings = get_settings()
        bundle_payload = {
            "sub": sub,
            "businessId": settings.hardcoded_business_id,
            "role": "OWNER",
            "assignedStore": None,
            "name": settings.hardcoded_admin_name,
            "email": settings.admin_username,
        }
    else:
        from app.database.client import get_database
        from bson import ObjectId
        repo = UserRepository(get_database())
        try:
            oid = ObjectId(sub)
        except Exception:
            raise UnauthorizedError(code="UNAUTHORIZED", message="Invalid refresh token")
        user = await repo.collection.find_one({"_id": oid})
        if not user or not user.get("isActive", True):
            raise UnauthorizedError(code="UNAUTHORIZED", message="Invalid refresh token")
        bundle_payload = {
            "sub": str(user["_id"]),
            "businessId": user.get("businessId"),
            "role": user.get("role"),
            "assignedStore": user.get("assignedStore"),
            "name": user.get("name"),
            "email": user.get("email"),
        }
    return success_payload(_bundle(bundle_payload), message="Token refreshed")


@router.post("/logout")
async def logout(_: CurrentUser = Depends(get_current_user)):
    return success_payload({}, message="Logged out")


@router.get("/me")
async def me(current_user: CurrentUser = Depends(get_current_user)):
    """Return the currently authenticated user profile from the access token."""
    return success_payload(
        {
            "userId": current_user.userId,
            "businessId": current_user.businessId,
            "role": current_user.role,
            "assignedStore": current_user.assignedStore,
            "name": current_user.name,
            "email": current_user.email,
        },
        message="OK",
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(_: RegisterRequest):
    raise AppException(
        code="REGISTER_DISABLED",
        message="Registration is disabled; ask your admin to create an account",
        status_code=status.HTTP_403_FORBIDDEN,
    )


@router.post("/forgot-password")
async def forgot_password(_: ForgotPasswordRequest):
    raise AppException(
        code="EMAIL_DISABLED",
        message="Password reset by email is disabled",
        status_code=status.HTTP_400_BAD_REQUEST,
    )


@router.post("/reset-password")
async def reset_password(_: ResetPasswordRequest):
    raise AppException(
        code="RESET_PASSWORD_DISABLED",
        message="Password reset is disabled",
        status_code=status.HTTP_400_BAD_REQUEST,
    )


@router.post("/change-password")
async def change_password(_: ChangePasswordRequest, __: CurrentUser = Depends(get_current_user)):
    raise AppException(
        code="CHANGE_PASSWORD_DISABLED",
        message="Change password is disabled in this build",
        status_code=status.HTTP_400_BAD_REQUEST,
    )
