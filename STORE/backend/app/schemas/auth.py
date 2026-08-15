from __future__ import annotations

import re
from typing import Annotated, Any

from pydantic import BaseModel, Field, field_validator


_PASSWORD_HAS_DIGIT = re.compile(r"\d")


def _validate_password(value: str) -> str:
    # Python-level check; pydantic's `pattern` uses Rust `regex` which forbids
    # look-around and breaks on Python 3.14's bundled pydantic-core.
    if not _PASSWORD_HAS_DIGIT.search(value):
        raise ValueError("password must contain at least one digit")
    return value


class RegisterRequest(BaseModel):
    businessName: Annotated[str, Field(min_length=1)]
    username: Annotated[str, Field(min_length=3)]
    password: Annotated[str, Field(min_length=8)]
    name: Annotated[str, Field(min_length=1)]
    industry: str | None = None

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return _validate_password(value)


class LoginRequest(BaseModel):
    username: Annotated[str, Field(min_length=1)]
    password: Annotated[str, Field(min_length=1)]


class RefreshTokenRequest(BaseModel):
    refreshToken: Annotated[str, Field(min_length=1)]


class ForgotPasswordRequest(BaseModel):
    username: Annotated[str, Field(min_length=1)]


class ResetPasswordRequest(BaseModel):
    token: Annotated[str, Field(min_length=1)]
    password: Annotated[str, Field(min_length=8)]

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return _validate_password(value)


class ChangePasswordRequest(BaseModel):
    currentPassword: Annotated[str, Field(min_length=1)]
    newPassword: Annotated[str, Field(min_length=8)]

    @field_validator("newPassword")
    @classmethod
    def _check_new_password(cls, value: str) -> str:
        return _validate_password(value)


class TokenPairResponse(BaseModel):
    accessToken: str
    refreshToken: str
