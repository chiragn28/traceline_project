import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, utcnow, uuid_pk


class IngestionCheckpoint(Base):
    """Resumable cursor into a data source's current csvlog file. Advanced
    only after a batch is durably committed (see app.services.ingestion),
    so a worker crash mid-batch re-reads from the last committed offset --
    never duplicates, never silently drops records.
    """

    __tablename__ = "ingestion_checkpoint"

    data_source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_source.id", ondelete="CASCADE"), primary_key=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    log_file: Mapped[str] = mapped_column(String(500), nullable=False)
    byte_offset: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class CoverageGap(Base):
    """A window of time Traceline cannot vouch for. Made visible to the
    customer instead of silently ignored -- a compliance report with a
    silent gap is worse than one that flags it (spec 5).

    Reasons:
      worker_downtime         -- the poller itself was down/crashed
      source_retention_exceeded -- the source rotated/deleted log files
                                    before the worker read them
      logging_disabled        -- the source's log_statement/logging_collector
                                    settings drifted from what full coverage
                                    requires (the admin/superuser-bypass
                                    blind spot made visible)
    """

    __tablename__ = "coverage_gap"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    data_source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_source.id", ondelete="CASCADE"), nullable=False
    )
    gap_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    gap_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    detected_at: Mapped[datetime] = created_at_col()
