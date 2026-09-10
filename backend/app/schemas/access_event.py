from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AccessEventOut(BaseModel):
    id: UUID
    data_source_id: UUID
    table_id: UUID | None
    schema_name_snapshot: str | None
    table_name_snapshot: str | None
    actor_identifier: str
    actor_type: str
    query_type: str
    source_ip: str | None
    source_region: str | None
    region_confidence: str
    region_source: str | None
    occurred_at: datetime
    ingested_at: datetime

    model_config = {"from_attributes": True}


class CoverageGapOut(BaseModel):
    id: UUID
    data_source_id: UUID
    gap_start: datetime
    gap_end: datetime | None
    reason: str
    detected_at: datetime

    model_config = {"from_attributes": True}
