from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ClassificationTagOut(BaseModel):
    id: UUID
    column_name: str | None
    tag: str
    effective_from: datetime
    superseded_at: datetime | None

    model_config = {"from_attributes": True}


class TableAssetOut(BaseModel):
    id: UUID
    data_source_id: UUID
    schema_name: str
    table_name: str
    discovered_at: datetime
    dropped_at: datetime | None
    current_tags: list[ClassificationTagOut] = []

    model_config = {"from_attributes": True}


class ClassificationTagCreate(BaseModel):
    tag: str
    column_name: str | None = None
