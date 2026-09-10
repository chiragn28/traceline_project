import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class User(Base):
    """Still no granular RBAC (spec section 2) -- 'admin' vs a plain
    teammate is the only role distinction. `can_review` is a separate,
    narrower flag (not a role) answering one specific question the access
    review pivot needs: is this person allowed to sign off on an access
    review decision. Kept separate from `role` because "can administer the
    workspace" and "is an authorized reviewer" are different questions --
    e.g. a customer may want a manager who isn't a Traceline admin to be a
    reviewer."""

    __tablename__ = "user"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="admin", nullable=False)
    can_review: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = created_at_col()
