from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.access_event import AccessEvent
from app.models.ingestion import CoverageGap
from app.schemas.access_event import AccessEventOut, CoverageGapOut

router = APIRouter(tags=["access-events"])


@router.get("/access-events", response_model=list[AccessEventOut])
def list_access_events(
    data_source_id: UUID | None = Query(default=None),
    actor: str | None = Query(default=None),
    query_type: str | None = Query(default=None),
    region: str | None = Query(default=None),
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
) -> list[AccessEvent]:
    stmt = select(AccessEvent).order_by(AccessEvent.occurred_at.desc()).limit(limit)
    if data_source_id:
        stmt = stmt.where(AccessEvent.data_source_id == data_source_id)
    if actor:
        stmt = stmt.where(AccessEvent.actor_identifier.ilike(f"%{actor}%"))
    if query_type:
        stmt = stmt.where(AccessEvent.query_type == query_type)
    if region:
        stmt = stmt.where(AccessEvent.source_region == region)
    if start:
        stmt = stmt.where(AccessEvent.occurred_at >= start)
    if end:
        stmt = stmt.where(AccessEvent.occurred_at <= end)
    return list(db.scalars(stmt))


@router.get("/coverage-gaps", response_model=list[CoverageGapOut])
def list_coverage_gaps(
    data_source_id: UUID | None = Query(default=None),
    open_only: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[CoverageGap]:
    stmt = select(CoverageGap).order_by(CoverageGap.detected_at.desc())
    if data_source_id:
        stmt = stmt.where(CoverageGap.data_source_id == data_source_id)
    if open_only:
        stmt = stmt.where(CoverageGap.gap_end.is_(None))
    return list(db.scalars(stmt))
