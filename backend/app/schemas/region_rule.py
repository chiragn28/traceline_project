import ipaddress
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator


class RegionRuleCreate(BaseModel):
    classification_tag: str
    approved_regions: list[str]
    applies_to_production_only: bool = True

    @field_validator("classification_tag")
    @classmethod
    def _tag_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("classification_tag must not be blank")
        return value.strip()

    @field_validator("approved_regions")
    @classmethod
    def _regions_not_empty(cls, value: list[str]) -> list[str]:
        cleaned = [r.strip() for r in value if r.strip()]
        if not cleaned:
            # An empty approved list silently means "every access to this
            # classification is a violation", which reads as a
            # misconfiguration far more often than as an intent. Make the
            # caller say so explicitly rather than discovering it via a
            # flood of flags.
            raise ValueError("approved_regions must contain at least one region")
        return cleaned


class RegionRuleOut(BaseModel):
    id: UUID
    classification_tag: str
    approved_regions: list[str]
    applies_to_production_only: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IpRegionMapCreate(BaseModel):
    cidr: str
    region: str

    @field_validator("cidr")
    @classmethod
    def _valid_cidr(cls, value: str) -> str:
        # An unparseable CIDR used to be accepted and then skipped at match
        # time (resolve_region catches ValueError per entry and moves on),
        # so a typo like "172.16.0.0/33" or "10.0.0/8" produced a rule that
        # silently never matched anything. For a control whose whole job is
        # deciding which access is in-region, failing quietly is the worst
        # available behaviour -- reject it at the point of entry instead.
        try:
            ipaddress.ip_network(value.strip(), strict=False)
        except ValueError as exc:
            raise ValueError(f"Not a valid CIDR block: {exc}") from exc
        return value.strip()

    @field_validator("region")
    @classmethod
    def _region_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("region must not be blank")
        return value.strip()


class IpRegionMapOut(BaseModel):
    id: UUID
    cidr: str
    region: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ViolationOut(BaseModel):
    id: UUID
    access_event_id: UUID
    region_rule_id: UUID
    table_id: UUID | None
    reason: str
    detected_at: datetime

    model_config = {"from_attributes": True}
