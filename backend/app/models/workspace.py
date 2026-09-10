import uuid
from datetime import datetime

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class Workspace(Base):
    """The strict multi-tenant isolation boundary. Every other tenant table
    carries a workspace_id and is protected by a Postgres RLS policy tied to
    it (see migration 0001)."""

    __tablename__ = "workspace"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = created_at_col()

    # Retention-vs-erasure tension (spec section 5): access/audit logs are
    # themselves personal data about who accessed what, which can conflict
    # with a data subject's erasure request. The MVP does not automate
    # purging -- it makes the policy an explicit, visible per-workspace
    # configuration choice instead of silently ignoring the conflict.
    access_log_retention_days: Mapped[int] = mapped_column(Integer, default=365, nullable=False)
    erasure_policy_note: Mapped[str | None] = mapped_column(Text, nullable=True)
