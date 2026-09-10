import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import created_at_col, uuid_pk


class DataSource(Base):
    """A connected Postgres instance. Only Postgres is supported in the MVP;
    `source_type` exists so Snowflake/BigQuery connectors can be added later
    without a schema migration."""

    __tablename__ = "data_source"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), default="postgres", nullable=False)

    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=5432, nullable=False)
    dbname: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    # Fernet-encrypted at rest -- see app.core.crypto. Never stored plaintext.
    encrypted_password: Mapped[str] = mapped_column(Text, nullable=False)

    # Path the worker tails for this source's csvlog files (mounted volume
    # in the demo/local setup; a real deployment would use a log-shipping
    # agent or cloud log export target instead).
    log_directory: Mapped[str] = mapped_column(String(500), nullable=False)

    # Lets customers exclude non-production sources from violation flags,
    # so staging traffic doesn't generate noise that erodes trust (spec 5).
    is_production: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    read_only_verified: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    read_only_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_only_warning: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = created_at_col()
