from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, get_db
from app.models.access_review import AccessReviewCycle, AccessReviewItem
from app.models.actor_ownership import ActorOwnership
from app.models.report import Report
from app.models.user import User
from app.schemas.access_review import (
    AccessReviewCycleCreate,
    AccessReviewCycleOut,
    AccessReviewItemOut,
    ActorOwnershipSet,
    ReviewDecisionRequest,
)
from app.schemas.report import ReportOut
from app.services.access_review import ReviewError, generate_review_cycle, is_stale, record_decision
from app.services.reports import generate_access_review_report_csv

router = APIRouter(tags=["access-reviews"])


@router.get("/access-reviews", response_model=list[AccessReviewCycleOut])
def list_cycles(db: Session = Depends(get_db)) -> list[AccessReviewCycleOut]:
    cycles = list(db.scalars(select(AccessReviewCycle).order_by(AccessReviewCycle.created_at.desc())))
    out = []
    for c in cycles:
        item_count = db.scalar(select(func.count()).select_from(AccessReviewItem).where(AccessReviewItem.cycle_id == c.id))
        pending_count = db.scalar(
            select(func.count())
            .select_from(AccessReviewItem)
            .where(AccessReviewItem.cycle_id == c.id, AccessReviewItem.decision == "pending")
        )
        row = AccessReviewCycleOut.model_validate(c)
        row.item_count = item_count or 0
        row.pending_count = pending_count or 0
        out.append(row)
    return out


@router.post("/access-reviews", response_model=AccessReviewCycleOut, status_code=status.HTTP_201_CREATED)
def create_cycle(
    body: AccessReviewCycleCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> AccessReviewCycleOut:
    result = generate_review_cycle(
        db, current_user.workspace_id, current_user.user_id, body.label, body.lookback_days
    )
    cycle = db.get(AccessReviewCycle, result.cycle_id)
    row = AccessReviewCycleOut.model_validate(cycle)
    row.item_count = result.item_count
    row.pending_count = result.item_count
    return row


@router.get("/access-reviews/{cycle_id}/items", response_model=list[AccessReviewItemOut])
def list_items(
    cycle_id: UUID,
    decision: str | None = Query(default=None),
    stale_only: bool = Query(default=False),
    stale_after_days: int = Query(default=30),
    db: Session = Depends(get_db),
) -> list[AccessReviewItemOut]:
    cycle = db.get(AccessReviewCycle, cycle_id)
    if not cycle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review cycle not found")

    stmt = select(AccessReviewItem).where(AccessReviewItem.cycle_id == cycle_id)
    if decision:
        stmt = stmt.where(AccessReviewItem.decision == decision)
    items = list(db.scalars(stmt))

    user_ids = {i.owner_user_id for i in items if i.owner_user_id} | {
        i.reviewed_by_user_id for i in items if i.reviewed_by_user_id
    }
    users_by_id = {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids)))} if user_ids else {}

    out = []
    for i in items:
        stale = is_stale(cycle.created_at, i.decision, stale_after_days)
        if stale_only and not stale:
            continue
        row = AccessReviewItemOut.model_validate(i)
        row.owner_email = users_by_id[i.owner_user_id].email if i.owner_user_id in users_by_id else None
        row.reviewer_email = users_by_id[i.reviewed_by_user_id].email if i.reviewed_by_user_id in users_by_id else None
        row.is_stale = stale
        out.append(row)
    return out


@router.post("/access-reviews/items/{item_id}/decision", response_model=AccessReviewItemOut)
def decide_item(
    item_id: UUID,
    body: ReviewDecisionRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> AccessReviewItemOut:
    reviewer = db.get(User, current_user.user_id)
    if not reviewer:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session user not found")

    try:
        item = record_decision(db, item_id, reviewer, body.decision, body.reason)
    except ReviewError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))

    row = AccessReviewItemOut.model_validate(item)
    row.reviewer_email = reviewer.email
    return row


@router.post("/access-reviews/{cycle_id}/report", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def generate_cycle_report(
    cycle_id: UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> Report:
    cycle = db.get(AccessReviewCycle, cycle_id)
    if not cycle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review cycle not found")

    file_path, content_sha256 = generate_access_review_report_csv(db, current_user.workspace_id, cycle_id)
    report = Report(
        workspace_id=current_user.workspace_id,
        generated_by_user_id=current_user.user_id,
        report_type="access_review",
        cycle_id=cycle_id,
        range_start=cycle.created_at,
        range_end=cycle.created_at,
        content_sha256=content_sha256,
        file_path=file_path,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/actor-ownership", response_model=list[ActorOwnershipSet])
def list_actor_ownership(db: Session = Depends(get_db)) -> list[ActorOwnership]:
    return list(db.scalars(select(ActorOwnership)))


@router.post("/actor-ownership", status_code=status.HTTP_201_CREATED)
def set_actor_ownership(
    body: ActorOwnershipSet,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ActorOwnershipSet:
    existing = db.scalar(
        select(ActorOwnership).where(
            ActorOwnership.workspace_id == current_user.workspace_id,
            ActorOwnership.actor_identifier == body.actor_identifier,
        )
    )
    if existing:
        existing.owner_user_id = body.owner_user_id
    else:
        db.add(
            ActorOwnership(
                workspace_id=current_user.workspace_id,
                actor_identifier=body.actor_identifier,
                owner_user_id=body.owner_user_id,
            )
        )
    db.commit()
    return body
