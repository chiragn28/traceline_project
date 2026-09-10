import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class IpRegionMap(Base):
    """Manual CIDR -> region mapping a workspace configures themselves.
    Backs the best-effort region detection described in spec section 5:
    no live cloud-metadata lookups in the MVP, so any match is only ever as
    good as what the customer has told Traceline."""

    __tablename__ = "ip_region_map"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    cidr: Mapped[str] = mapped_column(String(64), nullable=False)
    region: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = created_at_col()
