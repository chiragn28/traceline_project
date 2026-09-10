import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class Report(Base):
    """A generated, timestamped, hash-stamped export. `content_sha256` is
    computed once at generation time over the exact exported bytes, so a
    report can't be silently edited afterwards and still pass as the
    original -- callers re-verify the hash on download (spec 5:
    'tamper-evident')."""

    __tablename__ = "report"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    generated_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    # access_log (the original per-date-range export) or access_review (an
    # access review cycle's sign-off evidence, tied to cycle_id below).
    report_type: Mapped[str] = mapped_column(String(30), default="access_log", nullable=False)
    cycle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("access_review_cycle.id", ondelete="SET NULL"), nullable=True
    )

    range_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    range_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # All internal timestamps are UTC; reports must additionally state and
    # convert to local time since GCC regulators reference Gulf Standard
    # Time (spec 5). Stored so a report is self-describing.
    timezone_label: Mapped[str] = mapped_column(String(50), default="Asia/Dubai", nullable=False)

    generated_at: Mapped[datetime] = created_at_col()
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
