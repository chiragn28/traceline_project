"""Access review workflow: periodically surface every actor with access to
a sensitive (non-'public'-tagged) table, and require an authorized
reviewer to explicitly decide 'still needed' or 'revoke' -- the actual
evidence SOC 2 Type II / ISO 27001 auditors ask for on a database access
review.

"Has access" combines two signals (AccessReviewItem.access_basis):
  observed     -- at least one access_event against the table in the
                  cycle's lookback window.
  granted_only -- a live GRANT found via information_schema.role_table_grants
                  at cycle-generation time, with no matching access_event.
                  This is exactly the dormant-but-still-granted permission
                  an observed-access-only view would miss.
  both         -- both signals agree.
Grant introspection requires reaching the live source, so it's best-effort
too: if a source is unreachable when a cycle is generated, that source's
tables fall back to observed-access-only for this cycle (logged, not
silently ignored) rather than failing the whole cycle.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.access_event import AccessEvent
from app.models.access_review import AccessReviewCycle, AccessReviewItem
from app.models.actor_ownership import ActorOwnership
from app.models.classification import ClassificationTag
from app.models.data_source import DataSource
from app.models.table_asset import TableAsset
from app.models.user import User
from app.services.tables import build_connector

logger = logging.getLogger("traceline.access_review")

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


def _classify_grantee_type(grantee: str) -> str:
    # Same naming-convention heuristic as the log connector's actor
    # classification (see postgres_csvlog.py) -- kept as a small local
    # copy rather than reaching into a specific connector implementation,
    # since a grantee name and a logged actor name are different concerns
    # that happen to share a heuristic today.
    lowered = grantee.lower()
    if lowered.endswith(("_svc", "_service", "_app", "_job")) or lowered in {"demo_app"}:
        return "service_account"
    return "unknown"


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

    # One connector per data source, reused across that source's tables --
    # avoids reconnecting per table, and lets a single unreachable source
    # degrade gracefully without affecting other sources in the same cycle.
    connectors_by_source: dict[UUID, object] = {}
    grant_fetch_failed: set[UUID] = set()

    def _grants_for(table: TableAsset) -> list:
        if table.data_source_id in grant_fetch_failed:
            return []
        try:
            connector = connectors_by_source.get(table.data_source_id)
            if connector is None:
                data_source = db.get(DataSource, table.data_source_id)
                connector = build_connector(data_source)
                connectors_by_source[table.data_source_id] = connector
            return connector.list_table_grants(table.schema_name, table.table_name)
        except Exception:
            # Bad/rotated credentials, an unreachable source, or a
            # decrypt failure all land here -- none of them should fail
            # the whole cycle, just degrade that source to observed-access
            # only for this run (logged, not silently swallowed).
            grant_fetch_failed.add(table.data_source_id)
            logger.warning(
                "grant introspection failed for data_source=%s; falling back to observed-access only",
                table.data_source_id,
                exc_info=True,
            )
            return []

    item_count = 0
    for table in reviewable_tables:
        tags = _active_tags_now(db, table.id) - NON_REVIEWABLE_TAGS
        events = db.scalars(
            select(AccessEvent).where(
                AccessEvent.table_id == table.id,
                AccessEvent.occurred_at >= window_start,
            )
        ).all()

        by_actor: dict[str, list[AccessEvent]] = {}
        actor_types: dict[str, str] = {}
        for e in events:
            by_actor.setdefault(e.actor_identifier, []).append(e)
            actor_types[e.actor_identifier] = e.actor_type

        grantees = {g.grantee for g in _grants_for(table)}
        all_actors = set(by_actor) | grantees

        for actor_identifier in all_actors:
            actor_events = by_actor.get(actor_identifier)
            observed = actor_events is not None
            granted = actor_identifier in grantees
            basis = "both" if (observed and granted) else ("observed" if observed else "granted_only")

            occurred_ats = [e.occurred_at for e in actor_events] if actor_events else []
            actor_type = actor_types.get(actor_identifier) or _classify_grantee_type(actor_identifier)

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
                    access_basis=basis,
                    access_count=len(actor_events) if actor_events else 0,
                    first_seen_at=min(occurred_ats) if occurred_ats else None,
                    last_seen_at=max(occurred_ats) if occurred_ats else None,
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
    # change to their permissions must not rewrite this history. Role and
    # can_review are both checked: a viewer can't decide even if can_review
    # was left on, and a demoted account can't either.
    authorized = reviewer.can_review and reviewer.role in ("admin", "reviewer")
    if not authorized:
        raise ReviewError(f"{reviewer.email} is not an authorized reviewer for this workspace")

    item.decision = decision
    item.decision_reason = reason
    item.reviewed_by_user_id = reviewer.id
    item.reviewer_authorized_snapshot = authorized
    item.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


def is_stale(cycle_created_at: datetime, decision: str, stale_after_days: int = 30) -> bool:
    if decision != "pending":
        return False
    return (datetime.now(timezone.utc) - cycle_created_at) > timedelta(days=stale_after_days)
