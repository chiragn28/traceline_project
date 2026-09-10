import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class AccessEvent(Base):
    """One row per query/access, extracted from a data source's csvlog.

    Deliberately holds only metadata, never the raw query text or any
    business data (spec 5: 'no raw customer business data should be
    stored where avoidable') -- table names are best-effort-parsed and the
    original statement is discarded once parsed.
    """

    __tablename__ = "access_event"
    __table_args__ = (
        # Idempotent ingestion: replaying the same log line is a no-op.
        # source_log_id encodes (log file, byte offset) from the connector,
        # not a timestamp, so it is stable even for out-of-order or
        # replayed log delivery.
        UniqueConstraint("data_source_id", "source_log_id", name="uq_access_event_source_log_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    data_source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_source.id", ondelete="CASCADE"), nullable=False
    )
    source_log_id: Mapped[str] = mapped_column(String(500), nullable=False)

    # Nullable + snapshot columns: if the table is later dropped/renamed,
    # this historical event and any report built from it must not break.
    table_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("table_asset.id", ondelete="SET NULL"), nullable=True
    )
    schema_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    table_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)

    actor_identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    # human | service_account | unknown -- lets the UI distinguish scheduled
    # pipelines from real people (spec 5).
    actor_type: Mapped[str] = mapped_column(String(30), default="unknown", nullable=False)

    query_type: Mapped[str] = mapped_column(String(20), nullable=False)  # read | write | ddl | unknown

    source_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Best-effort only -- see app.services.region for how these are derived.
    # Never presented as a guarantee.
    source_region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    region_confidence: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)  # high|low|unknown
    region_source: Mapped[str | None] = mapped_column(String(255), nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ingested_at: Mapped[datetime] = created_at_col()
