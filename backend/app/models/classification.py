import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class ClassificationTag(Base):
    """Manual classification of a table (or, optionally, one column within
    it). Append-only: retagging inserts a new row and stamps
    `superseded_at` on the old one instead of overwriting it, so a report
    covering a past date range can honestly say what classification was in
    effect *at the time access occurred* (spec 5: 'is that itself logged as
    a change with a timestamp')."""

    __tablename__ = "classification_tag"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    table_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("table_asset.id", ondelete="CASCADE"), nullable=False
    )
    # NULL column_name means the tag applies to the whole table.
    column_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tag: Mapped[str] = mapped_column(String(100), nullable=False)  # pii | financial | public | custom

    created_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    effective_from: Mapped[datetime] = created_at_col()
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
