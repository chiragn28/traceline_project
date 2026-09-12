from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, get_db, require_role
from app.models.ip_region_map import IpRegionMap
from app.models.region_rule import RegionRule
from app.models.violation import Violation
from app.schemas.region_rule import (
    IpRegionMapCreate,
    IpRegionMapOut,
    RegionRuleCreate,
    RegionRuleOut,
    ViolationOut,
)

router = APIRouter(tags=["region-rules"])


@router.get("/region-rules", response_model=list[RegionRuleOut])
def list_region_rules(db: Session = Depends(get_db)) -> list[RegionRule]:
    return list(db.scalars(select(RegionRule)))


@router.post(
    "/region-rules",
    response_model=RegionRuleOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
def create_region_rule(
    body: RegionRuleCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> RegionRule:
    rule = RegionRule(
        workspace_id=current_user.workspace_id,
        classification_tag=body.classification_tag,
        approved_regions=body.approved_regions,
        applies_to_production_only=body.applies_to_production_only,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/ip-region-map", response_model=list[IpRegionMapOut])
def list_ip_region_map(db: Session = Depends(get_db)) -> list[IpRegionMap]:
    return list(db.scalars(select(IpRegionMap)))


@router.post(
    "/ip-region-map",
    response_model=IpRegionMapOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
def create_ip_region_map_entry(
    body: IpRegionMapCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> IpRegionMap:
    entry = IpRegionMap(workspace_id=current_user.workspace_id, cidr=body.cidr, region=body.region)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/violations", response_model=list[ViolationOut])
def list_violations(
    data_source_id: UUID | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[Violation]:
    # Previously this loaded every violation in the workspace and, when
    # filtering by source, every access_event id as well -- then filtered in
    # Python. On a workspace with real history that is unbounded memory on
    # an endpoint any viewer can call. The filter is now a subquery the
    # database resolves, and the result set is capped like /access-events.
    stmt = select(Violation).order_by(Violation.detected_at.desc()).limit(limit)
    if data_source_id:
        from app.models.access_event import AccessEvent

        stmt = stmt.where(
            Violation.access_event_id.in_(
                select(AccessEvent.id).where(AccessEvent.data_source_id == data_source_id)
            )
        )
    return list(db.scalars(stmt))
