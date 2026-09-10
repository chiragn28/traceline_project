"""Proves the multi-tenancy isolation requirement from spec section 5:
'Absolute enforcement that one workspace can never query or see another
workspace's data, even via bugs in shared queries.'

These tests deliberately write queries with NO workspace_id filter at all --
simulating exactly the kind of bug the spec is worried about -- and assert
Postgres Row-Level Security (migration 0001) still blocks cross-tenant
visibility, independent of any application-level filtering.
"""
import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.models.data_source import DataSource


def test_unfiltered_query_only_sees_own_workspace(
    admin_db, make_workspace, make_data_source, app_db_for
):
    ws_a = make_workspace("A")
    ws_b = make_workspace("B")
    make_data_source(ws_a, name="A's source")
    make_data_source(ws_b, name="B's source")
    admin_db.commit()

    db_a = app_db_for(ws_a)
    # Deliberately unfiltered -- this is the "forgot the WHERE clause" bug.
    rows = list(db_a.scalars(select(DataSource)))

    assert len(rows) == 1
    assert rows[0].name == "A's source"


def test_cross_tenant_fetch_by_id_returns_nothing(admin_db, make_workspace, make_data_source, app_db_for):
    ws_a = make_workspace("A")
    ws_b = make_workspace("B")
    b_source = make_data_source(ws_b, name="B's source")
    admin_db.commit()

    db_a = app_db_for(ws_a)
    result = db_a.get(DataSource, b_source.id)

    assert result is None


def test_raw_sql_without_where_clause_is_still_isolated(admin_db, make_workspace, make_data_source, app_db_for):
    """The literal scenario the spec calls out: a raw query that forgets
    to filter by workspace at all must still be blocked by RLS, not just
    by application code remembering to add a filter."""
    ws_a = make_workspace("A")
    ws_b = make_workspace("B")
    make_data_source(ws_a, name="A's source")
    make_data_source(ws_b, name="B's source")
    admin_db.commit()

    db_a = app_db_for(ws_a)
    rows = db_a.execute(text('SELECT name FROM "data_source"')).fetchall()

    assert [r[0] for r in rows] == ["A's source"]


def test_session_without_workspace_context_is_fail_closed(admin_db, make_workspace, make_data_source):
    """If app.workspace_id is never set on an app-role session (e.g. a
    future code path that forgets to call get_workspace_db), Postgres
    raises rather than silently returning all rows or none -- deny by
    default."""
    from app.db.session import AppSession

    ws_a = make_workspace("A")
    make_data_source(ws_a, name="A's source")
    admin_db.commit()

    bare_db = AppSession()
    try:
        # Any DBAPI error counts (unrecognized GUC) -- the exact
        # SQLSTATE/message is a Postgres-version detail we don't pin to.
        with pytest.raises(DBAPIError):
            bare_db.execute(text('SELECT * FROM "data_source"')).fetchall()
    finally:
        bare_db.rollback()
        bare_db.close()
