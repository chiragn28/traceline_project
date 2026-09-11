"""opt-in ip geolocation, grant-based review basis, role tiers

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column(
        "workspace", sa.Column("enable_ip_geolocation", sa.Boolean, nullable=False, server_default=sa.false())
    )

    op.create_table(
        "ip_geolocation_cache",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ip_address", sa.String(64), nullable=False),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column("country_code", sa.String(8), nullable=True),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("looked_up_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "ip_address", name="uq_ip_geolocation_cache_workspace_ip"),
    )

    op.add_column(
        "access_review_item", sa.Column("access_basis", sa.String(20), nullable=False, server_default="observed")
    )
    op.alter_column("access_review_item", "access_count", server_default="0")
    op.alter_column("access_review_item", "first_seen_at", nullable=True)
    op.alter_column("access_review_item", "last_seen_at", nullable=True)

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON \"ip_geolocation_cache\" TO traceline_app")
    op.execute('ALTER TABLE "ip_geolocation_cache" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        CREATE POLICY tenant_isolation ON "ip_geolocation_cache"
        USING (workspace_id = current_setting('app.workspace_id')::uuid)
        WITH CHECK (workspace_id = current_setting('app.workspace_id')::uuid)
        """
    )


def downgrade() -> None:
    op.execute('DROP POLICY IF EXISTS tenant_isolation ON "ip_geolocation_cache"')
    op.drop_table("ip_geolocation_cache")
    op.drop_column("workspace", "enable_ip_geolocation")
    op.alter_column("access_review_item", "first_seen_at", nullable=False)
    op.alter_column("access_review_item", "last_seen_at", nullable=False)
    op.drop_column("access_review_item", "access_basis")
