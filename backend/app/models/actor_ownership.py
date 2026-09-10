import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class ActorOwnership(Base):
    """Who is accountable for a given actor_identifier -- mainly for
    service accounts/pipeline credentials, so a review item shows a real
    person to follow up with instead of an anonymous 'system' row a
    reviewer just clicks through (spec: 'must be attributed to whoever
    owns that pipeline')."""

    __tablename__ = "actor_ownership"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    actor_identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    created_at: Mapped[datetime] = created_at_col()
