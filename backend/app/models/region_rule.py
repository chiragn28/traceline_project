import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class RegionRule(Base):
    """Per-workspace: which classification requires which approved
    region(s). Manually defined -- no live cloud-metadata detection in MVP
    (spec 2)."""

    __tablename__ = "region_rule"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    classification_tag: Mapped[str] = mapped_column(String(100), nullable=False)
    approved_regions: Mapped[list[str]] = mapped_column(ARRAY(String(100)), nullable=False)

    # Excludes non-production data sources from this rule's evaluation, so
    # staging/test traffic doesn't generate noise that erodes trust (spec 5).
    applies_to_production_only: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = created_at_col()
