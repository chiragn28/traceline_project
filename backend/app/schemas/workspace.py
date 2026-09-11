from uuid import UUID

from pydantic import BaseModel


class WorkspaceOut(BaseModel):
    id: UUID
    name: str
    access_log_retention_days: int
    erasure_policy_note: str | None
    enable_ip_geolocation: bool

    model_config = {"from_attributes": True}


class WorkspaceSettingsUpdate(BaseModel):
    enable_ip_geolocation: bool
