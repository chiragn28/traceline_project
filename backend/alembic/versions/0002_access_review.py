"""access review workflow (SOC 2 / ISO 27001 pivot)

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)

NEW_TENANT_TABLES = ["access_review_cycle", "access_review_item", "actor_ownership"]


def upgrade() -> None:
    op.add_column("user", sa.Column("can_review", sa.Boolean, nullable=False, server_default=sa.true()))

    op.create_table(
        "access_review_cycle",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("lookback_days", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_user_id", UUID, sa.ForeignKey("user.id"), nullable=False),
    )

    op.create_table(
        "access_review_item",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cycle_id", UUID, sa.ForeignKey("access_review_cycle.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_id", UUID, sa.ForeignKey("table_asset.id", ondelete="SET NULL"), nullable=True),
        sa.Column("schema_name_snapshot", sa.String(255), nullable=False),
        sa.Column("table_name_snapshot", sa.String(255), nullable=False),
        sa.Column("classification_tags_snapshot", sa.String(500), nullable=False),
        sa.Column("actor_identifier", sa.String(255), nullable=False),
        sa.Column("actor_type", sa.String(30), nullable=False),
        sa.Column("owner_user_id", UUID, sa.ForeignKey("user.id"), nullable=True),
        sa.Column("access_count", sa.Integer, nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decision", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("decision_reason", sa.Text, nullable=True),
        sa.Column("reviewed_by_user_id", UUID, sa.ForeignKey("user.id"), nullable=True),
        sa.Column("reviewer_authorized_snapshot", sa.Boolean, nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_access_review_item_cycle_id", "access_review_item", ["cycle_id"])

    op.create_table(
        "actor_ownership",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_identifier", sa.String(255), nullable=False),
        sa.Column("owner_user_id", UUID, sa.ForeignKey("user.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "actor_identifier", name="uq_actor_ownership_workspace_actor"),
    )

    op.add_column("report", sa.Column("report_type", sa.String(30), nullable=False, server_default="access_log"))
    op.add_column(
        "report",
        sa.Column("cycle_id", UUID, sa.ForeignKey("access_review_cycle.id", ondelete="SET NULL"), nullable=True),
    )

    for table in NEW_TENANT_TABLES:
        op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON "{table}" TO traceline_app')
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON "{table}"
            USING (workspace_id = current_setting('app.workspace_id')::uuid)
            WITH CHECK (workspace_id = current_setting('app.workspace_id')::uuid)
            """
        )


def downgrade() -> None:
    for table in NEW_TENANT_TABLES:
        op.execute(f'DROP POLICY IF EXISTS tenant_isolation ON "{table}"')

    op.drop_column("report", "cycle_id")
    op.drop_column("report", "report_type")
    op.drop_table("actor_ownership")
    op.drop_index("ix_access_review_item_cycle_id", table_name="access_review_item")
    op.drop_table("access_review_item")
    op.drop_table("access_review_cycle")
    op.drop_column("user", "can_review")
