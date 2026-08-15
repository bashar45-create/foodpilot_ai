from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


StoreType = Literal["RETAIL", "FOOD", "WAREHOUSE", "KITCHEN"]
StoreStatus = Literal["OPEN", "CLOSED", "INACTIVE"]


class StoreCreateRequest(BaseModel):
    """Payload accepted on `POST /api/v1/stores`.

    The frontend (Vite) sends flat fields: `name, code, address, city, phone,
    openingTime, closingTime`. We accept those directly and keep `type` optional
    so the backend can default it to ``RETAIL`` in the service layer. The legacy
    nested ``location`` / ``openingHours`` shapes are still accepted so existing
    seed data and any older clients keep working.
    """

    model_config = ConfigDict(extra="ignore")

    name: Annotated[str, Field(min_length=1)]
    type: StoreType | None = None
    code: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    openingTime: str | None = None
    closingTime: str | None = None
    isActive: bool | None = None
    # Legacy / seed-compatible nested shapes:
    location: dict[str, Any] | None = None
    openingHours: dict[str, Any] | None = None


class StoreUpdateRequest(BaseModel):
    """Payload accepted on `PUT /api/v1/stores/{id}`. All fields are optional."""

    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    type: StoreType | None = None
    code: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    openingTime: str | None = None
    closingTime: str | None = None
    isActive: bool | None = None
    location: dict[str, Any] | None = None
    openingHours: dict[str, Any] | None = None


class StoreStatusUpdateRequest(BaseModel):
    """Payload accepted on `PATCH /api/v1/stores/{id}/status`.

    Accepts either ``status`` (Literal) or ``isActive`` (bool). At least one must
    be provided; they are equivalent (``isActive=True`` ↔ ``status="OPEN"``).
    """

    model_config = ConfigDict(extra="ignore")

    status: StoreStatus | None = None
    isActive: bool | None = None

    @model_validator(mode="after")
    def _check_either(self) -> "StoreStatusUpdateRequest":
        if self.status is None and self.isActive is None:
            raise ValueError("either 'status' or 'isActive' must be provided")
        return self


class StoreOpenCloseRequest(BaseModel):
    date: str | None = None