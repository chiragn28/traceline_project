from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ReportCreate(BaseModel):
    range_start: datetime
    range_end: datetime


class ReportOut(BaseModel):
    id: UUID
    range_start: datetime
    range_end: datetime
    timezone_label: str
    generated_at: datetime
    content_sha256: str

    model_config = {"from_attributes": True}
