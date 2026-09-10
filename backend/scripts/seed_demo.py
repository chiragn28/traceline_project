"""Seeds a demo workspace, admin user, data source, and sample lineage
data for local dev/testing.

Idempotent section-by-section (not just "already ran once, skip
everything") so it's safe to re-run against an already-seeded environment
to backfill newly-added sample data, e.g. after a fresh `git pull`.

Run inside the backend container (or locally with DATABASE_URL/APP_DATABASE_URL
pointed at pg_metadata):
    python -m scripts.seed_demo
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.crypto import encrypt_secret
from app.core.security import hash_password
from app.db.session import AdminSession
from app.models.classification import ClassificationTag
from app.models.data_source import DataSource
from app.models.ip_region_map import IpRegionMap
from app.models.pipeline import Pipeline, PipelineTableEdge
from app.models.region_rule import RegionRule
from app.models.table_asset import TableAsset
from app.models.user import User
from app.models.workspace import Workspace

DEMO_EMAIL = "admin@demo-fintech.ae"
DEMO_PASSWORD = "demo-password-change-me"

# Mirrors customer-pg-demo/init.sql -- created directly here rather than by
# a live connector discovery pass, since the demo customer Postgres isn't
# reachable by its docker-network hostname from a host-run seed script.
DEMO_TABLES = ["customers", "products", "transactions"]

# Sample pipelines, since nothing in the MVP discovers these automatically
# (spec section 2/4: pipeline/job is a stub). Gives the lineage graph
# something real to draw beyond the observed-access edges.
DEMO_PIPELINES = [
    ("Nightly Analytics ETL", [("customers", "read"), ("transactions", "read"), ("products", "write")]),
    ("Support Portal Sync", [("customers", "read"), ("transactions", "write")]),
]

DEMO_TAGS = {"customers": "pii", "transactions": "financial", "products": "public"}


def _get_or_create_workspace(db) -> tuple[Workspace, User, bool]:
    existing_user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if existing_user:
        workspace = db.get(Workspace, existing_user.workspace_id)
        return workspace, existing_user, False

    workspace = Workspace(
        name="Demo Fintech DIFC",
        erasure_policy_note="Access logs retained 365 days per DIFC audit requirement; erasure requests reviewed manually.",
    )
    db.add(workspace)
    db.flush()
    user = User(workspace_id=workspace.id, email=DEMO_EMAIL, hashed_password=hash_password(DEMO_PASSWORD))
    db.add(user)
    db.flush()
    return workspace, user, True


def _get_or_create_data_source(db, workspace: Workspace) -> DataSource:
    ds = db.scalar(select(DataSource).where(DataSource.workspace_id == workspace.id))
    if ds:
        return ds
    ds = DataSource(
        workspace_id=workspace.id,
        name="Demo Customer Postgres",
        host="pg_customer_demo",
        port=5432,
        dbname="demo_customer",
        username="traceline_readonly",
        encrypted_password=encrypt_secret("traceline_readonly_password"),
        log_directory="/var/log/traceline_demo_source",
        is_production=True,
    )
    db.add(ds)
    db.flush()
    return ds


def _get_or_create_tables(db, workspace: Workspace, data_source: DataSource) -> dict[str, TableAsset]:
    existing = {
        t.table_name: t
        for t in db.scalars(
            select(TableAsset).where(TableAsset.data_source_id == data_source.id, TableAsset.dropped_at.is_(None))
        )
    }
    for name in DEMO_TABLES:
        if name not in existing:
            table = TableAsset(workspace_id=workspace.id, data_source_id=data_source.id, schema_name="public", table_name=name)
            db.add(table)
            db.flush()
            existing[name] = table
    return existing


def _ensure_tags(db, workspace: Workspace, user: User, tables: dict[str, TableAsset]) -> None:
    for table_name, tag in DEMO_TAGS.items():
        table = tables[table_name]
        active = db.scalar(
            select(ClassificationTag).where(
                ClassificationTag.table_id == table.id,
                ClassificationTag.column_name.is_(None),
                ClassificationTag.superseded_at.is_(None),
            )
        )
        if not active:
            db.add(
                ClassificationTag(
                    workspace_id=workspace.id, table_id=table.id, column_name=None, tag=tag, created_by_user_id=user.id
                )
            )


def _ensure_pipelines(db, workspace: Workspace, tables: dict[str, TableAsset]) -> None:
    existing_names = {p.name for p in db.scalars(select(Pipeline).where(Pipeline.workspace_id == workspace.id))}
    for name, edges in DEMO_PIPELINES:
        if name in existing_names:
            continue
        pipeline = Pipeline(workspace_id=workspace.id, name=name)
        db.add(pipeline)
        db.flush()
        for table_name, direction in edges:
            db.add(
                PipelineTableEdge(
                    workspace_id=workspace.id, pipeline_id=pipeline.id, table_id=tables[table_name].id, direction=direction
                )
            )


def _ensure_region_config(db, workspace: Workspace) -> None:
    if not db.scalar(select(IpRegionMap).where(IpRegionMap.workspace_id == workspace.id)):
        # UAE office/VPN range for the demo -- anything outside this is
        # "unknown" region with low confidence, which is the honest default.
        db.add(IpRegionMap(workspace_id=workspace.id, cidr="172.16.0.0/12", region="uae"))
        db.add(IpRegionMap(workspace_id=workspace.id, cidr="127.0.0.1/32", region="uae"))

    if not db.scalar(select(RegionRule).where(RegionRule.workspace_id == workspace.id)):
        db.add(
            RegionRule(
                workspace_id=workspace.id,
                classification_tag="pii",
                approved_regions=["uae"],
                applies_to_production_only=True,
            )
        )


def main() -> None:
    db = AdminSession()
    try:
        workspace, user, is_new = _get_or_create_workspace(db)
        data_source = _get_or_create_data_source(db, workspace)
        tables = _get_or_create_tables(db, workspace, data_source)
        _ensure_tags(db, workspace, user, tables)
        _ensure_pipelines(db, workspace, tables)
        _ensure_region_config(db, workspace)
        db.commit()

        if is_new:
            print(f"Seeded workspace={workspace.id} user={DEMO_EMAIL} password={DEMO_PASSWORD}")
        else:
            print(f"Demo user already existed ({DEMO_EMAIL}) -- backfilled any missing sample data (tables, tags, pipelines, region config).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
