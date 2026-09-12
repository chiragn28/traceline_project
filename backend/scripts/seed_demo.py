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
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select

from app.core.crypto import encrypt_secret
from app.core.security import hash_password
from app.db.session import AdminSession
from app.models.access_event import AccessEvent
from app.models.access_review import AccessReviewCycle, AccessReviewItem
from app.models.actor_ownership import ActorOwnership
from app.models.classification import ClassificationTag
from app.models.data_source import DataSource
from app.models.ingestion import CoverageGap
from app.models.ip_region_map import IpRegionMap
from app.models.pipeline import Pipeline, PipelineTableEdge
from app.models.region_rule import RegionRule
from app.models.report import Report
from app.models.table_asset import TableAsset
from app.models.user import User
from app.models.violation import Violation
from app.models.workspace import Workspace
from app.services.access_review import generate_review_cycle
from app.services.reports import generate_access_review_report_csv, generate_report_csv
from app.services.violations import evaluate_violations_for_source

DEMO_EMAIL = "admin@demo-fintech.ae"
DEMO_PASSWORD = "demo-password-change-me"

# One extra user per role tier, so the Team page's role selector and the
# access-review decision gating both have something real to demonstrate,
# not just the single admin account.
DEMO_TEAMMATES = [
    ("reviewer@demo-fintech.ae", "reviewer", True),
    ("viewer@demo-fintech.ae", "viewer", False),
]

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
    ds = db.scalar(select(DataSource).where(DataSource.workspace_id == workspace.id, DataSource.is_production.is_(True)))
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


def _get_or_create_staging_data_source(db, workspace: Workspace) -> DataSource:
    # Same physical demo Postgres, marked non-production -- lets the demo
    # show the "exclude staging from violation noise" scoping (spec 5)
    # for real, rather than just documenting that the flag exists.
    ds = db.scalar(select(DataSource).where(DataSource.workspace_id == workspace.id, DataSource.is_production.is_(False)))
    if ds:
        return ds
    ds = DataSource(
        workspace_id=workspace.id,
        name="Staging Postgres (non-production)",
        host="pg_customer_demo",
        port=5432,
        dbname="demo_customer",
        username="traceline_readonly",
        encrypted_password=encrypt_secret("traceline_readonly_password"),
        log_directory="/var/log/traceline_demo_source_staging",
        is_production=False,
    )
    db.add(ds)
    db.flush()
    return ds


def _get_or_create_staging_table(db, workspace: Workspace, staging_ds: DataSource) -> TableAsset:
    table = db.scalar(
        select(TableAsset).where(
            TableAsset.data_source_id == staging_ds.id, TableAsset.table_name == "customers", TableAsset.dropped_at.is_(None)
        )
    )
    if table:
        return table
    table = TableAsset(workspace_id=workspace.id, data_source_id=staging_ds.id, schema_name="public", table_name="customers")
    db.add(table)
    db.flush()
    return table


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
                    workspace_id=workspace.id,
                    table_id=table.id,
                    column_name=None,
                    tag=tag,
                    created_by_user_id=user.id,
                    # Backdated well before any synthetic access event's
                    # occurred_at -- the violation engine only flags an
                    # event against a tag that was active *at the time the
                    # access happened* (see app.services.violations), and
                    # the synthetic events themselves go back up to 30 days.
                    effective_from=datetime.now(timezone.utc) - timedelta(days=60),
                )
            )


def _ensure_staging_tag(db, workspace: Workspace, user: User, staging_table: TableAsset) -> None:
    active = db.scalar(
        select(ClassificationTag).where(
            ClassificationTag.table_id == staging_table.id,
            ClassificationTag.column_name.is_(None),
            ClassificationTag.superseded_at.is_(None),
        )
    )
    if not active:
        db.add(
            ClassificationTag(
                workspace_id=workspace.id,
                table_id=staging_table.id,
                column_name=None,
                tag="pii",
                created_by_user_id=user.id,
                effective_from=datetime.now(timezone.utc) - timedelta(days=60),
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


def _ensure_teammates(db, workspace: Workspace) -> None:
    for email, role, can_review in DEMO_TEAMMATES:
        if not db.scalar(select(User).where(User.email == email)):
            db.add(
                User(
                    workspace_id=workspace.id,
                    email=email,
                    hashed_password=hash_password(DEMO_PASSWORD),
                    role=role,
                    can_review=can_review,
                )
            )


def _ensure_actor_ownership(db, workspace: Workspace, admin_user: User) -> None:
    # Attributes the demo app's own service-account credential to the
    # admin user, so it doesn't show up as unowned "system" noise in a
    # review -- same reasoning as app.models.ActorOwnership.
    if not db.scalar(
        select(ActorOwnership).where(ActorOwnership.workspace_id == workspace.id, ActorOwnership.actor_identifier == "demo_app")
    ):
        db.add(ActorOwnership(workspace_id=workspace.id, actor_identifier="demo_app", owner_user_id=admin_user.id))


def _ensure_region_config(db, workspace: Workspace) -> None:
    if not db.scalar(select(IpRegionMap).where(IpRegionMap.workspace_id == workspace.id)):
        # UAE office/VPN range for the demo -- anything outside this is
        # "unknown" region with low confidence, which is the honest default.
        db.add(IpRegionMap(workspace_id=workspace.id, cidr="172.16.0.0/12", region="uae"))
        db.add(IpRegionMap(workspace_id=workspace.id, cidr="127.0.0.1/32", region="uae"))

    if not db.scalar(select(RegionRule).where(RegionRule.workspace_id == workspace.id, RegionRule.classification_tag == "pii")):
        db.add(
            RegionRule(
                workspace_id=workspace.id,
                classification_tag="pii",
                approved_regions=["uae"],
                applies_to_production_only=True,
            )
        )

    # Second rule/tag pair so the demo shows more than one classification
    # driving violations, and so evaluate_violations_for_source has two
    # independent rules to check per event.
    if not db.scalar(
        select(RegionRule).where(RegionRule.workspace_id == workspace.id, RegionRule.classification_tag == "financial")
    ):
        db.add(
            RegionRule(
                workspace_id=workspace.id,
                classification_tag="financial",
                approved_regions=["uae"],
                applies_to_production_only=True,
            )
        )


def _ensure_synthetic_access_events(db, workspace: Workspace, data_source: DataSource, tables: dict[str, TableAsset]) -> None:
    """Backs the hosted demo deployment, which has no live customer
    Postgres to tail (see README "Deploying it" -- Railway runs backend +
    worker + metadata Postgres only, not a whole second Postgres instance
    to log-tail). Also means a fresh local `docker compose up` looks
    populated immediately, before the worker has had time to ingest
    anything real. Skipped entirely once real ingestion has produced
    events, so it never overwrites genuine data with synthetic data.
    """
    if db.scalar(select(func.count()).select_from(AccessEvent).where(AccessEvent.data_source_id == data_source.id)):
        return

    now = datetime.now(timezone.utc)
    # 172.16.x.x matches the demo's own CIDR map entry (see
    # _ensure_region_config) -- "uae", high confidence. 203.0.113.x and
    # 198.51.100.x are real public documentation-only ranges (RFC 5737)
    # that deliberately do NOT match it, standing in for "an access from
    # somewhere the workspace hasn't told Traceline is expected" -- combined
    # with a region_rule, that's exactly what should trip a violation.
    # source_ip=None (the legacy_batch_job row) covers the case where the
    # log line itself carried no client address to resolve at all.
    synthetic = [
        ("demo_app", "service_account", "customers", "read", "172.16.5.10", "uae", "high", 14, 1),
        ("demo_app", "service_account", "transactions", "read", "172.16.5.10", "uae", "high", 13, 2),
        ("demo_app", "service_account", "products", "write", "172.16.5.11", "uae", "high", 12, 1),
        ("demo_app", "service_account", "products", "ddl", "172.16.5.11", "uae", "high", 30, 1),
        ("priya.raghunathan", "human", "customers", "read", "172.16.9.20", "uae", "high", 8, 1),
        ("priya.raghunathan", "human", "customers", "read", "203.0.113.42", None, "low", 2, 1),
        ("priya.raghunathan", "human", "transactions", "read", "203.0.113.42", None, "low", 2, 1),
        ("svc-reporting", "service_account", "transactions", "read", "172.16.5.12", "uae", "high", 5, 3),
        ("legacy_batch_job", "service_account", "transactions", "read", None, None, "unknown", 25, 1),
        ("unknown_client", "unknown", "products", "unknown", "198.51.100.7", None, "low", 6, 1),
    ]

    seq = 0
    for actor, actor_type, table_name, query_type, ip, region, confidence, days_ago, count in synthetic:
        table = tables[table_name]
        if ip is None:
            region_source = None
        elif region:
            region_source = "workspace CIDR map (172.16.0.0/12)"
        else:
            region_source = "no matching entry in workspace CIDR map"
        for i in range(count):
            seq += 1
            occurred_at = now - timedelta(days=days_ago, hours=i * 3)
            db.add(
                AccessEvent(
                    workspace_id=workspace.id,
                    data_source_id=data_source.id,
                    source_log_id=f"seed-synthetic:{seq}",
                    table_id=table.id,
                    schema_name_snapshot=table.schema_name,
                    table_name_snapshot=table.table_name,
                    actor_identifier=actor,
                    actor_type=actor_type,
                    query_type=query_type,
                    source_ip=ip,
                    source_region=region,
                    region_confidence=confidence,
                    region_source=region_source,
                    occurred_at=occurred_at,
                )
            )
    db.flush()


def _ensure_staging_events(db, workspace: Workspace, staging_ds: DataSource, staging_table: TableAsset) -> None:
    # An out-of-region PII access on the staging source -- same shape as
    # the one that trips a violation on the production source, so the demo
    # can show it does NOT produce a violation here (region_rule.pii has
    # applies_to_production_only=True and this source is_production=False).
    if db.scalar(select(func.count()).select_from(AccessEvent).where(AccessEvent.data_source_id == staging_ds.id)):
        return
    now = datetime.now(timezone.utc)
    db.add(
        AccessEvent(
            workspace_id=workspace.id,
            data_source_id=staging_ds.id,
            source_log_id="seed-staging:1",
            table_id=staging_table.id,
            schema_name_snapshot=staging_table.schema_name,
            table_name_snapshot=staging_table.table_name,
            actor_identifier="qa_engineer",
            actor_type="human",
            query_type="read",
            source_ip="203.0.113.99",
            source_region=None,
            region_confidence="low",
            region_source="no matching entry in workspace CIDR map",
            occurred_at=now - timedelta(days=4),
        )
    )
    db.flush()


def _ensure_coverage_gap(db, workspace: Workspace, data_source: DataSource) -> None:
    # So the Access Logs page's coverage-gap banner has something real to
    # show immediately, rather than only appearing once a real worker
    # outage or logging-config drift happens to occur.
    if db.scalar(select(func.count()).select_from(CoverageGap).where(CoverageGap.data_source_id == data_source.id)):
        return
    db.add(
        CoverageGap(
            workspace_id=workspace.id,
            data_source_id=data_source.id,
            gap_start=datetime.now(timezone.utc) - timedelta(hours=6),
            gap_end=None,
            reason="worker_downtime",
        )
    )


def _ensure_violations(db, workspace: Workspace, data_source: DataSource, staging_ds: DataSource) -> None:
    # Runs the actual rule engine (app.services.violations) against both
    # sources rather than hand-building Violation rows, so the demo proves
    # -- rather than just asserts -- that the pii/financial out-of-region
    # events on the production source flag, and the matching event on the
    # staging source (is_production=False) correctly does not.
    if db.scalar(select(func.count()).select_from(Violation).where(Violation.workspace_id == workspace.id)):
        return
    evaluate_violations_for_source(db, workspace.id, data_source)
    evaluate_violations_for_source(db, workspace.id, staging_ds)


def _ensure_review_cycles_and_reports(db, workspace: Workspace, admin_user: User) -> None:
    # Runs the real cycle-generation and report-generation code against
    # the seeded events, rather than hand-building rows that merely look
    # like their output -- so the hosted demo's "evidence" is byte-for-byte
    # what the product actually produces, hash included.
    #
    # Two cycles instead of one: an older, mostly-decided cycle so the
    # Access Reviews page has real history to show (decisions, reasons,
    # and one item left pending long enough to demonstrate the "stale"
    # badge), and a fresh, fully-pending cycle for the live demo user to
    # actually work through themselves.
    if db.scalar(select(func.count()).select_from(AccessReviewCycle).where(AccessReviewCycle.workspace_id == workspace.id)):
        return

    q2 = generate_review_cycle(db, workspace.id, admin_user.id, "Q2 2026", lookback_days=90)
    q2_cycle = db.get(AccessReviewCycle, q2.cycle_id)
    q2_created = datetime.now(timezone.utc) - timedelta(days=95)
    q2_cycle.created_at = q2_created
    db.flush()

    q2_items = list(
        db.scalars(select(AccessReviewItem).where(AccessReviewItem.cycle_id == q2.cycle_id).order_by(AccessReviewItem.id))
    )
    for i, item in enumerate(q2_items):
        if i == len(q2_items) - 1:
            continue  # left pending -- cycle is >30d old, so this shows as "stale"
        revoke = i % 3 == 0
        item.decision = "revoked" if revoke else "approved"
        item.decision_reason = (
            "Contractor engagement ended; access no longer required."
            if revoke
            else "Confirmed still needed for the pipeline/role it supports."
        )
        item.reviewed_by_user_id = admin_user.id
        item.reviewer_authorized_snapshot = True
        item.reviewed_at = q2_created + timedelta(days=3)
    db.commit()

    q2_review_content, q2_review_sha256 = generate_access_review_report_csv(db, workspace.id, q2.cycle_id)
    db.add(
        Report(
            workspace_id=workspace.id,
            generated_by_user_id=admin_user.id,
            report_type="access_review",
            cycle_id=q2.cycle_id,
            range_start=q2_created,
            range_end=q2_created,
            content_sha256=q2_review_sha256,
            content=q2_review_content,
        )
    )
    db.commit()

    q3 = generate_review_cycle(db, workspace.id, admin_user.id, "Q3 2026", lookback_days=90)

    # Grant introspection against the live demo Postgres is best-effort at
    # seed time too (see app.services.access_review) -- guarantee at least
    # one 'granted_only' item exists regardless of whether that lookup
    # actually succeeded here, since a dormant-but-still-granted permission
    # nobody has used (and nobody owns) is one of the review workflow's
    # key scenarios and shouldn't depend on network reachability at seed time.
    has_granted_only = db.scalar(
        select(func.count()).select_from(AccessReviewItem).where(
            AccessReviewItem.workspace_id == workspace.id, AccessReviewItem.access_basis == "granted_only"
        )
    )
    if not has_granted_only:
        customers_table = db.scalar(
            select(TableAsset).where(
                TableAsset.workspace_id == workspace.id,
                TableAsset.table_name == "customers",
                TableAsset.dropped_at.is_(None),
            )
        )
        if customers_table:
            db.add(
                AccessReviewItem(
                    workspace_id=workspace.id,
                    cycle_id=q3.cycle_id,
                    table_id=customers_table.id,
                    schema_name_snapshot="public",
                    table_name_snapshot="customers",
                    classification_tags_snapshot="pii",
                    actor_identifier="dormant_contractor",
                    actor_type="unknown",
                    owner_user_id=None,
                    access_basis="granted_only",
                    access_count=0,
                    first_seen_at=None,
                    last_seen_at=None,
                )
            )
            db.commit()

    range_end = datetime.now(timezone.utc)
    range_start = range_end - timedelta(days=30)
    content, content_sha256 = generate_report_csv(db, workspace.id, range_start, range_end)
    db.add(
        Report(
            workspace_id=workspace.id,
            generated_by_user_id=admin_user.id,
            report_type="access_log",
            range_start=range_start,
            range_end=range_end,
            content_sha256=content_sha256,
            content=content,
        )
    )
    db.commit()


def main() -> None:
    db = AdminSession()
    try:
        workspace, user, is_new = _get_or_create_workspace(db)
        data_source = _get_or_create_data_source(db, workspace)
        tables = _get_or_create_tables(db, workspace, data_source)
        _ensure_tags(db, workspace, user, tables)
        _ensure_pipelines(db, workspace, tables)
        _ensure_region_config(db, workspace)
        _ensure_teammates(db, workspace)
        _ensure_actor_ownership(db, workspace, user)
        _ensure_synthetic_access_events(db, workspace, data_source, tables)
        _ensure_coverage_gap(db, workspace, data_source)
        db.commit()

        staging_ds = _get_or_create_staging_data_source(db, workspace)
        staging_table = _get_or_create_staging_table(db, workspace, staging_ds)
        _ensure_staging_tag(db, workspace, user, staging_table)
        _ensure_staging_events(db, workspace, staging_ds, staging_table)
        db.commit()

        _ensure_violations(db, workspace, data_source, staging_ds)

        _ensure_review_cycles_and_reports(db, workspace, user)

        if is_new:
            print(f"Seeded workspace={workspace.id}")
            print(f"  admin:    {DEMO_EMAIL} / {DEMO_PASSWORD}")
            for email, role, _ in DEMO_TEAMMATES:
                print(f"  {role}: {email} / {DEMO_PASSWORD}")
        else:
            print(
                "Demo user already existed "
                f"({DEMO_EMAIL}) -- backfilled any missing sample data (tables, tags, pipelines, "
                "region config, teammates, ownership, staging source, coverage gap, review cycles)."
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
