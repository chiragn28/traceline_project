from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DataSourceCreate(BaseModel):
    name: str
    host: str
    port: int = 5432
    dbname: str
    username: str
    password: str
    log_directory: str = Field(description="Path the worker should tail for this source's csvlog files")
    is_production: bool = True


class DataSourceOut(BaseModel):
    id: UUID
    name: str
    source_type: str
    host: str
    port: int
    dbname: str
    username: str
    log_directory: str
    is_production: bool
    read_only_verified: bool | None
    read_only_checked_at: datetime | None
    read_only_warning: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TestConnectionResult(BaseModel):
    connected: bool
    read_only_verified: bool
    warning: str | None = None
    logging_coverage_ok: bool
    logging_coverage_warning: str | None = None
