import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class TableAsset(Base):
    """A discovered table within a data source. Soft-deleted (dropped_at)
    rather than hard-deleted on schema drift, so historical access_events
    and reports referencing it never break (spec 5: 'schema changes
    mid-stream')."""

    __tablename__ = "table_asset"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    data_source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_source.id", ondelete="CASCADE"), nullable=False
    )
    schema_name: Mapped[str] = mapped_column(String(255), nullable=False)
    table_name: Mapped[str] = mapped_column(String(255), nullable=False)

    discovered_at: Mapped[datetime] = created_at_col()
    dropped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
