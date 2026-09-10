from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RegionRuleCreate(BaseModel):
    classification_tag: str
    approved_regions: list[str]
    applies_to_production_only: bool = True


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
