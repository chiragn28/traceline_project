import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, get_db, require_role
from app.core.crypto import encrypt_secret
from app.models.data_source import DataSource
from app.schemas.data_source import DataSourceCreate, DataSourceOut, TestConnectionResult
from app.services.tables import CredentialDecryptionError, build_connector, sync_tables

router = APIRouter(prefix="/data-sources", tags=["data-sources"])

logger = logging.getLogger("traceline.data_sources")


@router.get("", response_model=list[DataSourceOut])
def list_data_sources(db: Session = Depends(get_db)) -> list[DataSource]:
    return list(db.scalars(select(DataSource)))


@router.post(
    "", response_model=DataSourceOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))]
)
def create_data_source(
    body: DataSourceCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> DataSource:
    data_source = DataSource(
        workspace_id=current_user.workspace_id,
        name=body.name,
        host=body.host,
        port=body.port,
        dbname=body.dbname,
        username=body.username,
        encrypted_password=encrypt_secret(body.password),
        log_directory=body.log_directory,
        is_production=body.is_production,
    )
    db.add(data_source)
    db.flush()

    _run_connection_check(data_source)
    db.flush()

    try:
        sync_tables(db, current_user.workspace_id, data_source)
    except Exception:
        # Table discovery is best-effort at create time -- the source may be
        # unreachable, and the connection result above already tells the
        # user that. Logged with a traceback rather than swallowed silently,
        # so a genuine bug in discovery doesn't look identical to "the
        # customer's database was down for a moment".
        logger.warning("table discovery failed for new data_source=%s", data_source.id, exc_info=True)

    db.commit()
    db.refresh(data_source)
    return data_source


@router.post(
    "/{data_source_id}/test-connection",
    response_model=TestConnectionResult,
    dependencies=[Depends(require_role("admin", "reviewer"))],
)
def test_connection(data_source_id: UUID, db: Session = Depends(get_db)) -> TestConnectionResult:
    data_source = db.get(DataSource, data_source_id)
    if not data_source:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Data source not found")

    try:
        connection_result = _run_connection_check(data_source)
        connector = build_connector(data_source)
        coverage = connector.check_logging_coverage()
    except CredentialDecryptionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))

    db.commit()
    return TestConnectionResult(
        connected=connection_result.connected,
        read_only_verified=connection_result.read_only_verified,
        warning=connection_result.warning,
        logging_coverage_ok=coverage.ok,
        logging_coverage_warning=coverage.warning,
    )


def _run_connection_check(data_source: DataSource):
    connector = build_connector(data_source)
    result = connector.test_connection()
    data_source.read_only_verified = result.read_only_verified
    data_source.read_only_checked_at = datetime.now(timezone.utc)
    data_source.read_only_warning = result.warning
    return result
