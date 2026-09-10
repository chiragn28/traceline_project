import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class AccessReviewCycle(Base):
    """One 'run' of an access review (e.g. a quarter). Items are generated
    fresh from current access_event/classification data at creation time --
    a snapshot. A table's access list changing the day after a cycle is
    generated does NOT retroactively invalidate this cycle's decisions; it
    simply shows up as a (possibly new) item the next time a cycle is
    generated (spec: 'reviews should be tied to a snapshot in time')."""

    __tablename__ = "access_review_cycle"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    lookback_days: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = created_at_col()
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)


class AccessReviewItem(Base):
    """One (table, actor) pair that needs a reviewer's sign-off: 'is this
    person/service account's access to this sensitive table still needed?'

    'Has access' here means *observed access* -- at least one access_event
    against this table within the cycle's lookback window -- not a GRANT
    introspection. This is a known MVP limitation (see README): a
    dormant-but-still-granted permission that nobody has exercised recently
    will not appear.

    Decisions are immutable once made (see app.services.access_review) --
    a wrong sign-off gets corrected in the next cycle, not silently edited,
    so a completed review stays defensible as evidence.
    """

    __tablename__ = "access_review_item"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("access_review_cycle.id", ondelete="CASCADE"), nullable=False
    )
    table_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("table_asset.id", ondelete="SET NULL"), nullable=True
    )
    schema_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    table_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    classification_tags_snapshot: Mapped[str] = mapped_column(
        String(500), nullable=False
    )  # comma-joined, as of generation time -- not a live join to classification_tag

    actor_identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    actor_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # Attribution for service accounts, so they aren't unowned "system"
    # noise a reviewer just skips over (spec: 'attributed to whoever owns
    # that pipeline'). NULL for a human actor, or a service account
    # nobody has claimed ownership of yet via app.models.ActorOwnership.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=True)

    access_count: Mapped[int] = mapped_column(Integer, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    decision: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending|approved|revoked
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=True)
    # Captured at decision time so a later change to the reviewer's
    # permissions doesn't rewrite history about who was authorized when
    # the call was actually made.
    reviewer_authorized_snapshot: Mapped[bool | None] = mapped_column(nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = created_at_col()
