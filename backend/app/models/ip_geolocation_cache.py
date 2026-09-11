import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class IpGeolocationCache(Base):
    """Caches a third-party geolocation lookup for one IP address, so a
    repeatedly-seen actor IP triggers one external request, not one per
    access_event. Only ever populated when the workspace has explicitly
    opted in (Workspace.enable_ip_geolocation) and the IP is not a private/
    internal address (see app.services.geolocation)."""

    __tablename__ = "ip_geolocation_cache"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    looked_up_at: Mapped[datetime] = created_at_col()
