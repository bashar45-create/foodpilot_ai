from __future__ import annotations

from typing import Any


def success_payload(data: Any = None, *, message: str | None = None, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"success": True, "data": data}
    if message is not None:
        payload["message"] = message
    if meta is not None:
        payload["meta"] = meta
    return payload


def error_payload(code: str, message: str, *, details: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"success": False, "error": {"code": code, "message": message}}
    if details is not None:
        payload["error"]["details"] = details
    return payload
