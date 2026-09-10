"""Proves the access-review edge cases from the SOC 2 / ISO 27001 pivot:
- a reviewer decision requires the reviewer to actually be authorized
  ('can_review'), not just any workspace user
- a decision is immutable once made -- a wrong sign-off is corrected by the
  next cycle, not silently edited
- only tables with an active *sensitive* (non-'public') tag generate
  review items
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.access_event import AccessEvent
from app.models.access_review import AccessReviewItem
from app.models.classification import ClassificationTag
from app.models.table_asset import TableAsset
from app.services.access_review import ReviewError, generate_review_cycle, is_stale, record_decision


def _tag_table(admin_db, workspace, table, tag, user):
    admin_db.add(
        ClassificationTag(workspace_id=workspace.id, table_id=table.id, column_name=None, tag=tag, created_by_user_id=user.id)
    )
    admin_db.flush()


def _make_table(admin_db, workspace, data_source, name="customers"):
    table = TableAsset(workspace_id=workspace.id, data_source_id=data_source.id, schema_name="public", table_name=name)
    admin_db.add(table)
    admin_db.flush()
    return table


def _make_access_event(admin_db, workspace, data_source, table, actor="amina", log_id_suffix="1", when=None):
    event = AccessEvent(
        workspace_id=workspace.id,
        data_source_id=data_source.id,
        source_log_id=f"f.csv:{log_id_suffix}",
        table_id=table.id,
        schema_name_snapshot=table.schema_name,
        table_name_snapshot=table.table_name,
        actor_identifier=actor,
        actor_type="human",
        query_type="read",
        occurred_at=when or datetime.now(timezone.utc),
    )
    admin_db.add(event)
    admin_db.flush()
    return event


def test_only_sensitive_tagged_tables_generate_items(admin_db, make_workspace, make_user, make_data_source):
    ws = make_workspace()
    user = make_user(ws)
    ds = make_data_source(ws)

    public_table = _make_table(admin_db, ws, ds, "products")
    _tag_table(admin_db, ws, public_table, "public", user)
    _make_access_event(admin_db, ws, ds, public_table, log_id_suffix="pub1")

    pii_table = _make_table(admin_db, ws, ds, "customers")
    _tag_table(admin_db, ws, pii_table, "pii", user)
    _make_access_event(admin_db, ws, ds, pii_table, log_id_suffix="pii1")
    admin_db.commit()

    result = generate_review_cycle(admin_db, ws.id, user.id, "Q3 2026")

    assert result.item_count == 1  # only the pii-tagged table produced an item


def test_unauthorized_reviewer_is_rejected(admin_db, make_workspace, make_user, make_data_source):
    ws = make_workspace()
    admin_user = make_user(ws, can_review=True)
    non_reviewer = make_user(ws, can_review=False)
    ds = make_data_source(ws)

    table = _make_table(admin_db, ws, ds)
    _tag_table(admin_db, ws, table, "pii", admin_user)
    _make_access_event(admin_db, ws, ds, table)
    admin_db.commit()

    result = generate_review_cycle(admin_db, ws.id, admin_user.id, "Q3 2026")
    item_id = admin_db.execute(
        select(AccessReviewItem.id).where(AccessReviewItem.cycle_id == result.cycle_id)
    ).scalar_one()

    with pytest.raises(ReviewError, match="not an authorized reviewer"):
        record_decision(admin_db, item_id, non_reviewer, "approved", None)


def test_decision_is_immutable_once_made(admin_db, make_workspace, make_user, make_data_source):
    ws = make_workspace()
    reviewer = make_user(ws, can_review=True)
    ds = make_data_source(ws)

    table = _make_table(admin_db, ws, ds)
    _tag_table(admin_db, ws, table, "financial", reviewer)
    _make_access_event(admin_db, ws, ds, table)
    admin_db.commit()

    result = generate_review_cycle(admin_db, ws.id, reviewer.id, "Q3 2026")
    item_id = admin_db.execute(
        select(AccessReviewItem.id).where(AccessReviewItem.cycle_id == result.cycle_id)
    ).scalar_one()

    decided = record_decision(admin_db, item_id, reviewer, "approved", "still needed for support tooling")
    assert decided.decision == "approved"
    assert decided.reviewer_authorized_snapshot is True

    with pytest.raises(ReviewError, match="already been decided"):
        record_decision(admin_db, item_id, reviewer, "revoked", "changed my mind")


def test_staleness_only_applies_to_pending_items():
    old_cycle_time = datetime.now(timezone.utc) - timedelta(days=45)
    assert is_stale(old_cycle_time, "pending", stale_after_days=30) is True
    assert is_stale(old_cycle_time, "approved", stale_after_days=30) is False

    recent_cycle_time = datetime.now(timezone.utc) - timedelta(days=5)
    assert is_stale(recent_cycle_time, "pending", stale_after_days=30) is False
