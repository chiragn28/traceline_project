"""Two separate engines, deliberately:

- `admin_engine` / `AdminSession`: owns the schema. Used by Alembic, the
  seed script, and -- the one deliberate exception -- the login lookup,
  which must find a user by email *before* a workspace_id is known and so
  cannot go through an RLS-scoped session. Every other request handler uses
  the workspace-scoped session below.
- `app_engine` / `AppSession`: connects as the non-owner `traceline_app`
  role, so Postgres Row-Level Security policies apply in full. Every
  request-scoped session goes through `get_workspace_db`, which also issues
  `SET LOCAL app.workspace_id = ...` so RLS can filter rows -- this is the
  defense-in-depth backstop for multi-tenancy, independent of whatever
  WHERE clause the calling code does or doesn't remember to write.

Important gotcha this module works around: `SET LOCAL` (and the
parameterized `set_config(..., is_local=true)` equivalent) is scoped to a
single transaction -- it reverts once that transaction commits or rolls
back. A session that commits more than once (e.g. the worker running
ingestion, then violation evaluation, on the same session) would silently
lose its workspace_id context after the first commit and start failing
closed on the second. `workspace_scoped_session` below fixes this with an
`after_begin` event listener that re-applies the setting at the start of
*every* transaction on the session, not just the first.
"""
from collections.abc import Generator
from uuid import UUID

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

admin_engine = create_engine(settings.database_url, future=True)
AdminSession = sessionmaker(bind=admin_engine, autoflush=False, expire_on_commit=False)

app_engine = create_engine(settings.app_database_url, future=True)
AppSession = sessionmaker(bind=app_engine, autoflush=False, expire_on_commit=False)


def get_admin_db() -> Generator[Session, None, None]:
    db = AdminSession()
    try:
        yield db
    finally:
        db.close()


def workspace_scoped_session(workspace_id: UUID) -> Session:
    """Open an app-role session with the RLS session variable set for
    *every* transaction on it, not just the first. Callers MUST use this
    (never AppSession directly) for anything touching tenant tables.
    """
    db = AppSession()

    # set_config(..., is_local=true) is the parameterized equivalent of
    # SET LOCAL -- plain SET/SET LOCAL cannot take a bind parameter at all
    # (Postgres only accepts a literal there), so set_config is also what
    # keeps this safe from injection despite workspace_id being
    # interpolated into a query. Bound via after_begin (not called once
    # up front) so it re-applies after every commit, when SQLAlchemy
    # silently opens a new transaction for the next statement -- see the
    # module docstring for why a one-shot call is not enough.
    @event.listens_for(db, "after_begin")
    def _set_workspace_context(session, transaction, connection):
        connection.execute(text("SELECT set_config('app.workspace_id', :wid, true)"), {"wid": str(workspace_id)})

    return db


def get_workspace_db(workspace_id: UUID) -> Generator[Session, None, None]:
    db = workspace_scoped_session(workspace_id)
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
