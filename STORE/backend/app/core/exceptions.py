from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class AppErrorDetail:
    code: str
    message: str
    details: dict[str, Any] | None = None


class AppException(Exception):
    def __init__(self, code: str, message: str, *, status_code: int = 400, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class NotFoundError(AppException):
    def __init__(self, code: str = "NOT_FOUND", message: str = "Resource not found", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code, message, status_code=404, details=details)


class ConflictError(AppException):
    def __init__(self, code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code, message, status_code=409, details=details)


class ValidationError(AppException):
    def __init__(self, code: str = "VALIDATION_ERROR", message: str = "Invalid request", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code, message, status_code=422, details=details)


class UnauthorizedError(AppException):
    def __init__(self, code: str = "UNAUTHORIZED", message: str = "Authentication required", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code, message, status_code=401, details=details)


class ForbiddenError(AppException):
    def __init__(self, code: str = "FORBIDDEN", message: str = "Forbidden", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code, message, status_code=403, details=details)


class ServiceUnavailableError(AppException):
    def __init__(self, code: str = "SERVICE_UNAVAILABLE", message: str = "Service unavailable", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code, message, status_code=503, details=details)