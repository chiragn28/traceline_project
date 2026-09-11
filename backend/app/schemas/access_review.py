from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AccessReviewCycleCreate(BaseModel):
    label: str
    lookback_days: int = 90


class AccessReviewCycleOut(BaseModel):
    id: UUID
    label: str
    lookback_days: int
    created_at: datetime
    item_count: int = 0
    pending_count: int = 0

    model_config = {"from_attributes": True}


class AccessReviewItemOut(BaseModel):
    id: UUID
    cycle_id: UUID
    table_id: UUID | None
    schema_name_snapshot: str
    table_name_snapshot: str
    classification_tags_snapshot: str
    actor_identifier: str
    actor_type: str
    owner_user_id: UUID | None
    owner_email: str | None = None
    access_basis: str = "observed"
    access_count: int
    first_seen_at: datetime | None
    last_seen_at: datetime | None
    decision: str
    decision_reason: str | None
    reviewed_by_user_id: UUID | None
    reviewer_email: str | None = None
    reviewed_at: datetime | None
    is_stale: bool = False

    model_config = {"from_attributes": True}


class ReviewDecisionRequest(BaseModel):
    decision: str  # approved | revoked
    reason: str | None = None


class ActorOwnershipSet(BaseModel):
    actor_identifier: str
    owner_user_id: UUID
