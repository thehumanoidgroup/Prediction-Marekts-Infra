from typing import Any

from pydantic import BaseModel, Field


class TenantResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    slug: str
    name: str
    tagline: str
    is_active: bool
    branding: dict[str, Any]
    features: dict[str, Any]
    program: dict[str, Any]


class TenantBrandingUpdate(BaseModel):
    """Partial white-label theme update (PropFirmAdmin)."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    tagline: str | None = Field(default=None, max_length=255)
    branding: dict[str, Any] | None = None
    features: dict[str, Any] | None = None
    program: dict[str, Any] | None = None


class TenantCreate(BaseModel):
    """New firm onboarding (SuperAdmin)."""

    slug: str = Field(min_length=2, max_length=63, pattern=r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
    name: str = Field(min_length=1, max_length=120)
    tagline: str = Field(default="", max_length=255)
    branding: dict[str, Any] | None = None
    features: dict[str, Any] | None = None
    program: dict[str, Any] | None = None
