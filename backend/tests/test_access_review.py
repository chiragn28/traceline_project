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


class _FakeGrant:
    def __init__(self, grantee):
        self.grantee = grantee
        self.privilege = "SELECT"


class _FakeConnector:
    def __init__(self, grantees):
        self._grantees = grantees

    def list_table_grants(self, schema_name, table_name):
        return [_FakeGrant(g) for g in self._grantees]


def test_dormant_grant_surfaces_as_granted_only_item(
    admin_db, make_workspace, make_user, make_data_source, monkeypatch
):
    """The exact gap a purely observed-access review would miss: a role
    that was granted SELECT but hasn't queried the table recently must
    still show up, flagged distinctly, not be silently absent."""
    import app.services.access_review as access_review_module

    ws = make_workspace()
    user = make_user(ws)
    ds = make_data_source(ws)

    table = _make_table(admin_db, ws, ds, "customers")
    _tag_table(admin_db, ws, table, "pii", user)
    # One actor with real recent activity, to prove 'both' classification too.
    _make_access_event(admin_db, ws, ds, table, actor="active_user")
    admin_db.commit()

    monkeypatch.setattr(
        access_review_module,
        "build_connector",
        lambda data_source: _FakeConnector(["active_user", "dormant_contractor"]),
    )

    result = generate_review_cycle(admin_db, ws.id, user.id, "Q3 2026")
    assert result.item_count == 2

    items = {
        i.actor_identifier: i
        for i in admin_db.scalars(select(AccessReviewItem).where(AccessReviewItem.cycle_id == result.cycle_id))
    }
    assert items["dormant_contractor"].access_basis == "granted_only"
    assert items["dormant_contractor"].access_count == 0
    assert items["dormant_contractor"].first_seen_at is None
    assert items["active_user"].access_basis == "both"
    assert items["active_user"].access_count == 1


def test_grant_introspection_failure_degrades_to_observed_only(
    admin_db, make_workspace, make_user, make_data_source, monkeypatch
):
    """An unreachable source (bad credentials, network blip) during cycle
    generation must not fail the whole cycle -- it degrades that source to
    observed-access-only, which is exactly what earlier versions always did."""
    import app.services.access_review as access_review_module

    ws = make_workspace()
    user = make_user(ws)
    ds = make_data_source(ws)

    table = _make_table(admin_db, ws, ds, "customers")
    _tag_table(admin_db, ws, table, "pii", user)
    _make_access_event(admin_db, ws, ds, table, actor="active_user")
    admin_db.commit()

    def _raise(*args, **kwargs):
        raise ConnectionError("simulated unreachable source")

    monkeypatch.setattr(access_review_module, "build_connector", _raise)

    result = generate_review_cycle(admin_db, ws.id, user.id, "Q3 2026")

    assert result.item_count == 1
    item = admin_db.scalar(select(AccessReviewItem).where(AccessReviewItem.cycle_id == result.cycle_id))
    assert item.access_basis == "observed"
