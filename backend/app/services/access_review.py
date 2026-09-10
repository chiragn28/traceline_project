"""Access review workflow: periodically surface every actor with observed
access to a sensitive (non-'public'-tagged) table, and require an
authorized reviewer to explicitly decide 'still needed' or 'revoke' -- the
actual evidence SOC 2 Type II / ISO 27001 auditors ask for on a database
access review.

Important, deliberate limitation: "has access" here means *observed
access* -- at least one access_event against the table within the cycle's
lookback window -- not a GRANT/permission introspection. A person who
technically retains a grant but hasn't queried the table in the window will
not appear as an item. This is the same "best-effort, label your
confidence" philosophy used elsewhere in Traceline (region detection,
logging coverage) rather than silently implying a completeness guarantee
this product cannot make without direct database permission access.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.access_event import AccessEvent
from app.models.access_review import AccessReviewCycle, AccessReviewItem
from app.models.actor_ownership import ActorOwnership
from app.models.classification import ClassificationTag
from app.models.table_asset import TableAsset
from app.models.user import User

# A table with only a 'public' tag (or no tag at all) isn't a review
# candidate -- review effort is spent on what's actually sensitive.
NON_REVIEWABLE_TAGS = {"public"}


@dataclass
class CycleGenerationResult:
    cycle_id: UUID
    item_count: int


def _active_tags_now(db: Session, table_id: UUID) -> set[str]:
    tags = db.scalars(
        select(ClassificationTag).where(
            ClassificationTag.table_id == table_id,
            ClassificationTag.superseded_at.is_(None),
        )
    ).all()
    return {t.tag for t in tags}


def generate_review_cycle(
    db: Session, workspace_id: UUID, created_by_user_id: UUID, label: str, lookback_days: int = 90
) -> CycleGenerationResult:
    cycle = AccessReviewCycle(
        workspace_id=workspace_id,
        label=label,
        lookback_days=lookback_days,
        created_by_user_id=created_by_user_id,
    )
    db.add(cycle)
    db.flush()

    window_start = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    reviewable_tables = [
        t
        for t in db.scalars(select(TableAsset).where(TableAsset.workspace_id == workspace_id, TableAsset.dropped_at.is_(None)))
        if (_active_tags_now(db, t.id) - NON_REVIEWABLE_TAGS)
    ]

    ownership_by_actor = {
        o.actor_identifier: o.owner_user_id
        for o in db.scalars(select(ActorOwnership).where(ActorOwnership.workspace_id == workspace_id))
    }

    item_count = 0
    for table in reviewable_tables:
        tags = _active_tags_now(db, table.id) - NON_REVIEWABLE_TAGS
        events = db.scalars(
            select(AccessEvent).where(
                AccessEvent.table_id == table.id,
                AccessEvent.occurred_at >= window_start,
            )
        ).all()

        by_actor: dict[tuple[str, str], list[AccessEvent]] = {}
        for e in events:
            by_actor.setdefault((e.actor_identifier, e.actor_type), []).append(e)

        for (actor_identifier, actor_type), actor_events in by_actor.items():
            occurred_ats = [e.occurred_at for e in actor_events]
            db.add(
                AccessReviewItem(
                    workspace_id=workspace_id,
                    cycle_id=cycle.id,
                    table_id=table.id,
                    schema_name_snapshot=table.schema_name,
                    table_name_snapshot=table.table_name,
                    classification_tags_snapshot=",".join(sorted(tags)),
                    actor_identifier=actor_identifier,
                    actor_type=actor_type,
                    owner_user_id=ownership_by_actor.get(actor_identifier),
                    access_count=len(actor_events),
                    first_seen_at=min(occurred_ats),
                    last_seen_at=max(occurred_ats),
                )
            )
            item_count += 1

    db.commit()
    return CycleGenerationResult(cycle_id=cycle.id, item_count=item_count)


class ReviewError(Exception):
    pass


def record_decision(db: Session, item_id: UUID, reviewer: User, decision: str, reason: str | None) -> AccessReviewItem:
    if decision not in ("approved", "revoked"):
        raise ReviewError("decision must be 'approved' or 'revoked'")

    item = db.get(AccessReviewItem, item_id)
    if item is None:
        raise ReviewError("review item not found")

    if item.decision != "pending":
        # Immutable once decided: a wrong call gets corrected by the next
        # cycle, not silently rewritten, so a completed review stays
        # defensible as evidence of what was actually decided and when.
        raise ReviewError("this item has already been decided and cannot be changed")

    # Reviewer accountability (spec): record whether this person was
    # actually authorized to review at the moment of the decision, rather
    # than just trusting the caller -- and snapshot it, since a later
    # change to their permissions must not rewrite this history.
    if not reviewer.can_review:
        raise ReviewError(f"{reviewer.email} is not an authorized reviewer for this workspace")

    item.decision = decision
    item.decision_reason = reason
    item.reviewed_by_user_id = reviewer.id
    item.reviewer_authorized_snapshot = reviewer.can_review
    item.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


def is_stale(cycle_created_at: datetime, decision: str, stale_after_days: int = 30) -> bool:
    if decision != "pending":
        return False
    return (datetime.now(timezone.utc) - cycle_created_at) > timedelta(days=stale_after_days)
