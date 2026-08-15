from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field


class UserCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1)]
    email: Annotated[str, Field(min_length=1)]
    role: Annotated[str, Field(min_length=1)]
    assignedStore: str | None = None


class UserUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None


class UserStatusUpdateRequest(BaseModel):
    isActive: bool


class UserAssignStoreRequest(BaseModel):
    storeId: str | None = None


class UserResetPasswordRequest(BaseModel):
    # Manager-driven reset (PATCH /users/{id}/reset-password). The new password
    # is optional; when omitted we generate a temporary one server-side.
    newPassword: Annotated[str, Field(default="", min_length=0, max_length=128)] = ""
    password: Annotated[str, Field(default="", min_length=0, max_length=128)] = ""
