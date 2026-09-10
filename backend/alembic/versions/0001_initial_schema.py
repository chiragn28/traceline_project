"""initial schema + row-level security

Revision ID: 0001
Revises:
Create Date: 2026-09-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)

# Tables carrying workspace_id, protected by an identical RLS policy shape.
# Every one of these MUST be queried through app.db.session.get_workspace_db
# (the traceline_app role, RLS-scoped session) -- never through the admin
# engine -- for the isolation guarantee to hold.
TENANT_TABLES = [
    "user",
    "data_source",
    "table_asset",
    "classification_tag",
    "access_event",
    "ingestion_checkpoint",
    "coverage_gap",
    "pipeline",
    "pipeline_table_edge",
    "region_rule",
    "ip_region_map",
    "violation",
    "report",
]


def upgrade() -> None:
    op.create_table(
        "workspace",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("access_log_retention_days", sa.Integer, nullable=False, server_default="365"),
        sa.Column("erasure_policy_note", sa.Text, nullable=True),
    )

    op.create_table(
        "user",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="admin"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        # Global, not per-workspace: login resolves a workspace from an
        # email before any tenant context exists, so email must be
        # unambiguous. Cross-system identity resolution (the same real
        # person having separate accounts elsewhere) is explicitly out of
        # scope for MVP (spec 5).
        sa.UniqueConstraint("email", name="uq_user_email"),
    )

    op.create_table(
        "data_source",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False, server_default="postgres"),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("port", sa.Integer, nullable=False, server_default="5432"),
        sa.Column("dbname", sa.String(255), nullable=False),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("encrypted_password", sa.Text, nullable=False),
        sa.Column("log_directory", sa.String(500), nullable=False),
        sa.Column("is_production", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("read_only_verified", sa.Boolean, nullable=True),
        sa.Column("read_only_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_only_warning", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "table_asset",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_source_id", UUID, sa.ForeignKey("data_source.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schema_name", sa.String(255), nullable=False),
        sa.Column("table_name", sa.String(255), nullable=False),
        sa.Column("discovered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dropped_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "data_source_id", "schema_name", "table_name", name="uq_table_asset_source_schema_table"
        ),
    )

    op.create_table(
        "classification_tag",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_id", UUID, sa.ForeignKey("table_asset.id", ondelete="CASCADE"), nullable=False),
        sa.Column("column_name", sa.String(255), nullable=True),
        sa.Column("tag", sa.String(100), nullable=False),
        sa.Column("created_by_user_id", UUID, sa.ForeignKey("user.id"), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "access_event",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_source_id", UUID, sa.ForeignKey("data_source.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_log_id", sa.String(500), nullable=False),
        sa.Column("table_id", UUID, sa.ForeignKey("table_asset.id", ondelete="SET NULL"), nullable=True),
        sa.Column("schema_name_snapshot", sa.String(255), nullable=True),
        sa.Column("table_name_snapshot", sa.String(255), nullable=True),
        sa.Column("actor_identifier", sa.String(255), nullable=False),
        sa.Column("actor_type", sa.String(30), nullable=False, server_default="unknown"),
        sa.Column("query_type", sa.String(20), nullable=False),
        sa.Column("source_ip", sa.String(64), nullable=True),
        sa.Column("source_region", sa.String(100), nullable=True),
        sa.Column("region_confidence", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("region_source", sa.String(255), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("data_source_id", "source_log_id", name="uq_access_event_source_log_id"),
    )
    op.create_index("ix_access_event_workspace_occurred_at", "access_event", ["workspace_id", "occurred_at"])
    op.create_index("ix_access_event_table_id", "access_event", ["table_id"])

    op.create_table(
        "ingestion_checkpoint",
        sa.Column("data_source_id", UUID, sa.ForeignKey("data_source.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("log_file", sa.String(500), nullable=False),
        sa.Column("byte_offset", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "coverage_gap",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_source_id", UUID, sa.ForeignKey("data_source.id", ondelete="CASCADE"), nullable=False),
        sa.Column("gap_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("gap_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.String(50), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "pipeline",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
    )

    op.create_table(
        "pipeline_table_edge",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pipeline_id", UUID, sa.ForeignKey("pipeline.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_id", UUID, sa.ForeignKey("table_asset.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
    )

    op.create_table(
        "region_rule",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("classification_tag", sa.String(100), nullable=False),
        sa.Column("approved_regions", postgresql.ARRAY(sa.String(100)), nullable=False),
        sa.Column("applies_to_production_only", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "ip_region_map",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cidr", sa.String(64), nullable=False),
        sa.Column("region", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "violation",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("access_event_id", UUID, sa.ForeignKey("access_event.id", ondelete="CASCADE"), nullable=False),
        sa.Column("region_rule_id", UUID, sa.ForeignKey("region_rule.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_id", UUID, sa.ForeignKey("table_asset.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "report",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False),
        sa.Column("generated_by_user_id", UUID, sa.ForeignKey("user.id"), nullable=False),
        sa.Column("range_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("range_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone_label", sa.String(50), nullable=False, server_default="Asia/Dubai"),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("file_path", sa.String(1000), nullable=False),
    )

    # --- Row-Level Security -------------------------------------------------
    # `traceline_app` is a plain LOGIN role, distinct from and not owned by
    # the admin/migration role (`traceline_admin`). Because it does not own
    # these tables, RLS policies apply to it in full -- unlike the owner,
    # which bypasses RLS unless FORCE ROW LEVEL SECURITY is also set. This
    # is what makes RLS a real backstop against a query that forgets a
    # workspace_id filter, not just a paper guarantee.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'traceline_app') THEN
                CREATE ROLE traceline_app LOGIN PASSWORD 'traceline_app';
            END IF;
        END
        $$;
        """
    )
    op.execute("GRANT CONNECT ON DATABASE traceline TO traceline_app")
    op.execute("GRANT USAGE ON SCHEMA public TO traceline_app")

    for table in TENANT_TABLES:
        op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON "{table}" TO traceline_app')
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON "{table}"
            USING (workspace_id = current_setting('app.workspace_id')::uuid)
            WITH CHECK (workspace_id = current_setting('app.workspace_id')::uuid)
            """
        )

    # workspace itself has no workspace_id column (it IS the tenant), so it
    # gets its own narrower policy: a session may only ever see its own row.
    op.execute('GRANT SELECT, UPDATE ON "workspace" TO traceline_app')
    op.execute('ALTER TABLE "workspace" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        CREATE POLICY tenant_isolation ON "workspace"
        USING (id = current_setting('app.workspace_id')::uuid)
        WITH CHECK (id = current_setting('app.workspace_id')::uuid)
        """
    )

    # Sequences (if any) aren't used -- all PKs are client-generated UUIDs --
    # so no additional sequence grants are needed.


def downgrade() -> None:
    for table in ["workspace", *TENANT_TABLES]:
        op.execute(f'DROP POLICY IF EXISTS tenant_isolation ON "{table}"')

    op.drop_table("report")
    op.drop_table("violation")
    op.drop_table("ip_region_map")
    op.drop_table("region_rule")
    op.drop_table("pipeline_table_edge")
    op.drop_table("pipeline")
    op.drop_table("coverage_gap")
    op.drop_table("ingestion_checkpoint")
    op.drop_index("ix_access_event_table_id", table_name="access_event")
    op.drop_index("ix_access_event_workspace_occurred_at", table_name="access_event")
    op.drop_table("access_event")
    op.drop_table("classification_tag")
    op.drop_table("table_asset")
    op.drop_table("data_source")
    op.drop_table("user")
    op.drop_table("workspace")
    op.execute("DROP ROLE IF EXISTS traceline_app")
